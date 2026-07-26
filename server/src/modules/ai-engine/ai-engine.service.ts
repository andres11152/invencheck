import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnidadMedida } from '../../generated/prisma/client';
import { DictadoVozItem, parseVoiceItemsLocally } from './voice-parser.util';
import type { EnvironmentVariables } from '../../config/env.validation';

export type FuenteDictado =
  'GEMINI' | 'REGLAS_LOCALES' | 'ESCANER_SKU' | 'SELECCION_MANUAL';

export interface ProcesarDictadoVozResult {
  items: DictadoVozItem[];
  fuente: FuenteDictado;
}

const DEFAULT_SYSTEM_PROMPT = `Eres el motor de extracción de una app de toma física de inventario por voz para hotelería/AYB en Colombia.
Recibes la transcripción de lo que dictó un operario.
Extrae TODOS los ítems como una lista JSON. Para cada ítem identifica:
- articuloBusqueda: el nombre textual del artículo tal como fue dictado (sin cantidades ni unidades).
- cantidad: el número, como valor numérico (float).
- unidadDictada: una de exactamente estas unidades: UNIDAD, KILOGRAMO, GRAMO, LITRO, MILILITRO, PORCION, CANASTILLA, CAJA.
  Si no se menciona unidad explícita, usa UNIDAD.
Responde únicamente con JSON válido de la forma: {"items": [{"articuloBusqueda": string, "cantidad": number, "unidadDictada": string}]}`;

interface GeminiGenerateContentResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

/**
 * Códigos HTTP de Gemini que ameritan un reintento con backoff:
 * 429 (Rate Limit), 500 (Internal), 502 (Bad Gateway), 503 (Unavailable), 504 (Timeout).
 */
const GEMINI_RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

/** Tope defensivo: nunca esperar más que esto por un `Retry-After`, aunque Gemini pida más. */
const RETRY_AFTER_MAX_MS = 10_000;

/** Error HTTP de Gemini con el status y (si vino) el `Retry-After` ya parseados — evita tener que re-parsear el mensaje de error con regex para decidir la estrategia de reintento. */
class GeminiHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfterMs: number | null,
    /**
     * true si la violación de cuota es diaria/mensual (`quotaId` contiene
     * "PerDay"/"PerMonth") — un reintento en segundos NUNCA la libera, sin
     * importar qué diga `retryDelay`. false para límites de ráfaga
     * (por minuto/segundo), donde sí vale la pena esperar y reintentar.
     */
    public readonly esCuotaDiariaOMensual: boolean = false,
  ) {
    super(message);
    this.name = 'GeminiHttpError';
  }
}

/** `Retry-After` puede venir como segundos ("30") o como fecha HTTP — soporta ambos formatos. */
function parseRetryAfterHeader(header: string): number | null {
  const segundos = Number(header);
  if (Number.isFinite(segundos)) return Math.max(0, segundos * 1000);
  const fecha = Date.parse(header);
  if (!Number.isNaN(fecha)) return Math.max(0, fecha - Date.now());
  return null;
}

interface GeminiErrorBody {
  error?: {
    message?: string;
    details?: Array<{
      '@type'?: string;
      retryDelay?: string;
      violations?: Array<{ quotaId?: string; quotaMetric?: string }>;
    }>;
  };
}

/**
 * Gemini NUNCA manda el header HTTP `Retry-After` en un 429 — el tiempo de
 * espera sugerido viene dentro del cuerpo JSON, en
 * `error.details[]` como un objeto `google.rpc.RetryInfo` (`retryDelay:
 * "4s"`), junto a un `google.rpc.QuotaFailure` que indica qué cuota se
 * excedió. Antes de este fix solo se miraba el header (siempre ausente), así
 * que NINGÚN 429 de Gemini se reintentaba jamás, incluidos los límites de
 * ráfaga (por minuto/segundo) donde sí hubiera valido la pena esperar los
 * pocos segundos que Gemini mismo sugiere.
 */
function parseGeminiRetryInfo(bodyText: string): {
  retryAfterMs: number | null;
  esCuotaDiariaOMensual: boolean;
} {
  try {
    const body = JSON.parse(bodyText) as GeminiErrorBody;
    const details = body.error?.details ?? [];

    let retryAfterMs: number | null = null;
    const retryInfo = details.find(
      (d) => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo',
    );
    if (retryInfo?.retryDelay) {
      const match = /^(\d+(?:\.\d+)?)s$/.exec(retryInfo.retryDelay);
      if (match) retryAfterMs = Math.round(Number(match[1]) * 1000);
    }

    const quotaFailure = details.find(
      (d) => d['@type'] === 'type.googleapis.com/google.rpc.QuotaFailure',
    );
    const quotaIds = (quotaFailure?.violations ?? [])
      .map((v) => `${v.quotaId ?? ''} ${v.quotaMetric ?? ''}`)
      .join(' ');
    const esCuotaDiariaOMensual = /PerDay|PerMonth/i.test(quotaIds);

    return { retryAfterMs, esCuotaDiariaOMensual };
  } catch {
    return { retryAfterMs: null, esCuotaDiariaOMensual: false };
  }
}

/**
 * Procesa dictado de voz/texto a ítems estructurados. Prioriza Gemini si hay
 * GEMINI_API_KEY; de lo contrario, cae a un parser local basado en reglas/regex
 * en español.
 *
 * Estrategia de resiliencia para Gemini:
 *  - Errores 5xx transitorios: hasta GEMINI_MAX_RETRIES reintentos con
 *    backoff exponencial + jitter.
 *  - 429 (rate limit / cuota agotada): Gemini NUNCA manda el header HTTP
 *    `Retry-After` — el tiempo sugerido viene en el CUERPO JSON
 *    (`error.details[]`, objeto `google.rpc.RetryInfo.retryDelay`), junto a
 *    un `google.rpc.QuotaFailure` que indica qué cuota se excedió (ver
 *    `parseGeminiRetryInfo`). Si esa cuota es diaria/mensual
 *    (`quotaId`/`quotaMetric` con "PerDay"/"PerMonth"), NINGÚN reintento la
 *    libera antes de que resetee — se cae directo al parser local sin
 *    gastar ni un intento. Si es un límite corto (por minuto/segundo, sin
 *    ese patrón en el quotaId), se espera el `retryDelay` indicado (topado a
 *    RETRY_AFTER_MAX_MS) y se reintenta.
 *  - Si se agotan los reintentos o el error no es reintentable, fallback
 *    transparente al parser local.
 */
@Injectable()
export class AiEngineService {
  private readonly logger = new Logger(AiEngineService.name);
  private readonly geminiApiKey?: string;
  private readonly geminiModel: string;
  private readonly systemPrompt: string;
  /** Número máximo de reintentos antes de caer al parser local. */
  private readonly maxRetries: number;
  /** Delay base en ms para el primer reintento (se duplica con cada intento). */
  private readonly baseDelayMs: number;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    this.geminiApiKey = configService.get('GEMINI_API_KEY', { infer: true });
    this.geminiModel =
      configService.get('GEMINI_MODEL', { infer: true }) ?? 'gemini-3.6-flash';
    this.systemPrompt =
      configService.get('GEMINI_SYSTEM_PROMPT', { infer: true }) ??
      DEFAULT_SYSTEM_PROMPT;
    this.maxRetries =
      configService.get('GEMINI_MAX_RETRIES', { infer: true }) ?? 3;
    this.baseDelayMs =
      configService.get('GEMINI_BASE_DELAY_MS', { infer: true }) ?? 500;
  }

  async procesarDictadoVoz(
    transcripcionTexto: string,
  ): Promise<ProcesarDictadoVozResult> {
    if (this.geminiApiKey) {
      try {
        const items = await this.procesarConGeminiConRetry(transcripcionTexto);
        return { items, fuente: 'GEMINI' };
      } catch (err) {
        this.logger.warn(
          `Gemini no disponible, usando parser local: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return {
      items: parseVoiceItemsLocally(transcripcionTexto),
      fuente: 'REGLAS_LOCALES',
    };
  }

  /**
   * Ejecuta la llamada a Gemini con reintentos. Ver la nota de la clase para
   * la estrategia completa (distinta para 429 con/sin `Retry-After` vs 5xx).
   */
  private async procesarConGeminiConRetry(
    texto: string,
  ): Promise<DictadoVozItem[]> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.procesarConGemini(texto);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (lastError instanceof GeminiHttpError) {
          if (!GEMINI_RETRYABLE_STATUSES.has(lastError.status)) {
            this.logger.error(
              `Error permanente de Gemini (${lastError.status}), no se reintentará: ${lastError.message}`,
            );
            throw lastError;
          }
          if (lastError.status === 429 && lastError.esCuotaDiariaOMensual) {
            this.logger.warn(
              `Gemini devolvió 429 por cuota DIARIA/MENSUAL agotada — ningún reintento la libera antes de que resetee, se cae al parser local: ${lastError.message}`,
            );
            throw lastError;
          }
          if (lastError.status === 429 && lastError.retryAfterMs === null) {
            this.logger.warn(
              `Gemini devolvió 429 sin ningún retryDelay reconocible (ni header ni cuerpo) — no tiene sentido reintentar a ciegas, se cae al parser local: ${lastError.message}`,
            );
            throw lastError;
          }
        }

        if (attempt >= this.maxRetries) break;

        const delay =
          lastError instanceof GeminiHttpError &&
          lastError.retryAfterMs !== null
            ? Math.min(lastError.retryAfterMs, RETRY_AFTER_MAX_MS)
            : this.baseDelayMs * Math.pow(2, attempt) +
              Math.random() * this.baseDelayMs;

        this.logger.warn(
          `Error transitorio de Gemini (intento ${attempt + 1}/${this.maxRetries + 1}): ${lastError.message} — reintentando en ${Math.round(delay)}ms`,
        );
        await this.sleep(delay);
      }
    }

    throw lastError ?? new Error('Gemini falló sin error registrado');
  }

  private async procesarConGemini(texto: string): Promise<DictadoVozItem[]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent?key=${this.geminiApiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: texto }] }],
        systemInstruction: {
          parts: [{ text: this.systemPrompt }],
        },
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              items: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    articuloBusqueda: { type: 'STRING' },
                    cantidad: { type: 'NUMBER' },
                    unidadDictada: {
                      type: 'STRING',
                      enum: Object.values(UnidadMedida),
                    },
                  },
                  required: ['articuloBusqueda', 'cantidad', 'unidadDictada'],
                },
              },
            },
            required: ['items'],
          },
        },
      }),
    });

    if (!response.ok) {
      const bodyText = await response.text();
      // Gemini no manda `Retry-After` como header (ver parseGeminiRetryInfo);
      // el header se revisa igual por si algún día empieza a mandarlo, o
      // para no depender únicamente del formato de cuerpo de un proveedor.
      const retryAfterHeader = response.headers.get('retry-after');
      const { retryAfterMs: retryAfterBody, esCuotaDiariaOMensual } =
        parseGeminiRetryInfo(bodyText);
      const retryAfterMs = retryAfterHeader
        ? parseRetryAfterHeader(retryAfterHeader)
        : retryAfterBody;
      throw new GeminiHttpError(
        `Gemini respondió ${response.status}: ${bodyText}`,
        response.status,
        retryAfterMs,
        esCuotaDiariaOMensual,
      );
    }

    const data = (await response.json()) as GeminiGenerateContentResponse;
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      throw new Error('Gemini no devolvió contenido en la respuesta');
    }

    const parsed = JSON.parse(content) as { items?: unknown };
    if (!Array.isArray(parsed.items)) {
      throw new Error('La respuesta de Gemini no contiene "items"');
    }

    return parsed.items.map((item) => this.normalizarItem(item));
  }

  private normalizarItem(item: unknown): DictadoVozItem {
    const raw = item as Partial<Record<string, unknown>>;
    const articuloBusqueda =
      typeof raw.articuloBusqueda === 'string'
        ? raw.articuloBusqueda.trim()
        : '';
    const cantidad = Number(raw.cantidad);
    const unidadRaw =
      typeof raw.unidadDictada === 'string'
        ? raw.unidadDictada.toUpperCase()
        : '';
    const unidadDictada = (Object.values(UnidadMedida) as string[]).includes(
      unidadRaw,
    )
      ? (unidadRaw as UnidadMedida)
      : UnidadMedida.UNIDAD;

    return {
      articuloBusqueda,
      cantidad: Number.isFinite(cantidad) ? cantidad : 0,
      unidadDictada,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
