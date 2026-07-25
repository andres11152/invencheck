import { Injectable, Logger } from '@nestjs/common';
import { UnidadMedida } from '../../generated/prisma/client';
import { DictadoVozItem, parseVoiceItemsLocally } from './voice-parser.util';

export type FuenteDictado = 'GEMINI' | 'REGLAS_LOCALES';

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

/**
 * Procesa dictado de voz/texto a ítems estructurados. Prioriza Gemini si hay
 * GEMINI_API_KEY; de lo contrario, cae a un parser local basado en reglas/regex
 * en español.
 *
 * Estrategia de resiliencia para Gemini:
 *  - Hasta GEMINI_MAX_RETRIES reintentos para errores transitorios (5xx / 429).
 *  - Backoff exponencial con jitter: delay = base * 2^intento + jitter aleatorio.
 *  - Si se agotan los reintentos, fallback transparente al parser local.
 */
@Injectable()
export class AiEngineService {
  private readonly logger = new Logger(AiEngineService.name);
  private readonly geminiApiKey = process.env.GEMINI_API_KEY;
  private readonly geminiModel = process.env.GEMINI_MODEL ?? 'gemini-3.6-flash';
  private readonly systemPrompt =
    process.env.GEMINI_SYSTEM_PROMPT ?? DEFAULT_SYSTEM_PROMPT;

  /** Número máximo de reintentos antes de caer al parser local. */
  private readonly maxRetries = (() => {
    const parsed = parseInt(process.env.GEMINI_MAX_RETRIES ?? '3', 10);
    return Number.isNaN(parsed) || parsed < 0 ? 3 : parsed;
  })();

  /** Delay base en ms para el primer reintento (se duplica con cada intento). */
  private readonly baseDelayMs = (() => {
    const parsed = parseInt(process.env.GEMINI_BASE_DELAY_MS ?? '500', 10);
    return Number.isNaN(parsed) || parsed < 100 ? 500 : parsed;
  })();

  async procesarDictadoVoz(
    transcripcionTexto: string,
  ): Promise<ProcesarDictadoVozResult> {
    if (this.geminiApiKey) {
      try {
        const items = await this.procesarConGeminiConRetry(transcripcionTexto);
        return { items, fuente: 'GEMINI' };
      } catch (err) {
        this.logger.warn(
          `Gemini no disponible tras ${this.maxRetries} intentos, usando parser local: ${
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
   * Ejecuta la llamada a Gemini con reintentos y backoff exponencial + jitter.
   * Solo reintenta para errores HTTP transitorios definidos en GEMINI_RETRYABLE_STATUSES.
   * Errores permanentes (4xx excluyendo 429) se propagan inmediatamente.
   */
  private async procesarConGeminiConRetry(
    texto: string,
  ): Promise<DictadoVozItem[]> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        // Backoff exponencial con jitter: evita que múltiples instancias colisionen
        const jitter = Math.random() * this.baseDelayMs;
        const delay = this.baseDelayMs * Math.pow(2, attempt - 1) + jitter;
        this.logger.log(
          `Reintento ${attempt}/${this.maxRetries} para Gemini en ${Math.round(delay)}ms...`,
        );
        await this.sleep(delay);
      }

      try {
        return await this.procesarConGemini(texto);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Extraer el código de estado HTTP del mensaje de error si existe
        const statusMatch = lastError.message.match(/Gemini respondió (\d{3})/);
        const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : null;

        if (statusCode !== null && !GEMINI_RETRYABLE_STATUSES.has(statusCode)) {
          // Error permanente (ej. 401 inválida, 400 malformed) → no reintentar
          this.logger.error(
            `Error permanente de Gemini (${statusCode}), no se reintentará: ${lastError.message}`,
          );
          throw lastError;
        }

        if (attempt < this.maxRetries) {
          this.logger.warn(
            `Error transitorio de Gemini (intento ${attempt + 1}/${this.maxRetries + 1}): ${lastError.message}`,
          );
        }
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
      throw new Error(
        `Gemini respondió ${response.status}: ${await response.text()}`,
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
