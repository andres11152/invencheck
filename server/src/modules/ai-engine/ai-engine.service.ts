import { Injectable, Logger } from '@nestjs/common';
import { UnidadMedida } from '../../generated/prisma/client';
import { DictadoVozItem, parseVoiceItemsLocally } from './voice-parser.util';

export type FuenteDictado = 'OPENAI' | 'GEMINI' | 'REGLAS_LOCALES';

export interface ProcesarDictadoVozResult {
  items: DictadoVozItem[];
  fuente: FuenteDictado;
}

const OPENAI_CHAT_COMPLETIONS_URL =
  'https://api.openai.com/v1/chat/completions';

const SYSTEM_PROMPT = `Eres el motor de extracción de una app de toma física de inventario por voz para un parque/hotel en Colombia.
Recibes la transcripción de lo que dictó un operario mientras contaba artículos físicamente.
Extrae TODOS los ítems contados como una lista JSON. Para cada ítem identifica:
- articuloBusqueda: el nombre textual del artículo tal como fue dictado (sin cantidades ni unidades).
- cantidad: el número contado, como valor numérico (float).
- unidadDictada: una de exactamente estas unidades: UNIDAD, KILOGRAMO, GRAMO, LITRO, MILILITRO, PORCION, CANASTILLA, CAJA.
  Si el operario no menciona una unidad explícita, usa UNIDAD.
Responde únicamente con JSON válido de la forma: {"items": [{"articuloBusqueda": string, "cantidad": number, "unidadDictada": string}]}`;

const RESPONSE_JSON_SCHEMA = {
  name: 'dictado_voz_inventario',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            articuloBusqueda: { type: 'string' },
            cantidad: { type: 'number' },
            unidadDictada: {
              type: 'string',
              enum: Object.values(UnidadMedida),
            },
          },
          required: ['articuloBusqueda', 'cantidad', 'unidadDictada'],
          additionalProperties: false,
        },
      },
    },
    required: ['items'],
    additionalProperties: false,
  },
};

interface OpenAiChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

/**
 * Procesa dictado de voz/texto a ítems estructurados. Prioriza Gemini si hay
 * GEMINI_API_KEY, luego OpenAI si hay OPENAI_API_KEY; de lo contrario, cae a
 * un parser local basado en reglas/regex en español.
 */
@Injectable()
export class AiEngineService {
  private readonly logger = new Logger(AiEngineService.name);
  private readonly openaiApiKey = process.env.OPENAI_API_KEY;
  private readonly openaiModel = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  private readonly geminiApiKey = process.env.GEMINI_API_KEY;
  private readonly geminiModel = process.env.GEMINI_MODEL ?? 'gemini-1.5-flash';

  async procesarDictadoVoz(
    transcripcionTexto: string,
  ): Promise<ProcesarDictadoVozResult> {
    if (this.geminiApiKey) {
      try {
        const items = await this.procesarConGemini(transcripcionTexto);
        return { items, fuente: 'GEMINI' };
      } catch (err) {
        this.logger.warn(
          `Fallo al usar Gemini, se intentará OpenAI u otro fallback: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    if (this.openaiApiKey) {
      try {
        const items = await this.procesarConOpenAi(transcripcionTexto);
        return { items, fuente: 'OPENAI' };
      } catch (err) {
        this.logger.warn(
          `Fallo al usar OpenAI, se usa el parser local: ${
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
          parts: [{ text: SYSTEM_PROMPT }],
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

  private async procesarConOpenAi(texto: string): Promise<DictadoVozItem[]> {
    const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: this.openaiModel,
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: texto },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: RESPONSE_JSON_SCHEMA,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `OpenAI respondió ${response.status}: ${await response.text()}`,
      );
    }

    const body = (await response.json()) as OpenAiChatCompletionResponse;
    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI no devolvió contenido en la respuesta');
    }

    const parsed = JSON.parse(content) as { items?: unknown };
    if (!Array.isArray(parsed.items)) {
      throw new Error('La respuesta de OpenAI no contiene "items"');
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
}
