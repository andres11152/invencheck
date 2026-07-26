import type { ConfigService } from '@nestjs/config';
import { AiEngineService } from './ai-engine.service';
import type { EnvironmentVariables } from '../../config/env.validation';

function buildService(overrides: Partial<EnvironmentVariables> = {}) {
  const values: Partial<EnvironmentVariables> = {
    GEMINI_API_KEY: 'test-key',
    GEMINI_MAX_RETRIES: 2,
    GEMINI_BASE_DELAY_MS: 1,
    ...overrides,
  };
  const configService = {
    get: jest.fn((key: keyof EnvironmentVariables) => values[key]),
  } as unknown as ConfigService<EnvironmentVariables, true>;
  return new AiEngineService(configService);
}

function geminiOkResponse(items: unknown[]): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        { content: { parts: [{ text: JSON.stringify({ items }) }] } },
      ],
    }),
    { status: 200 },
  );
}

function geminiErrorResponse(
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ error: 'boom' }), { status, headers });
}

/**
 * Réplica del cuerpo real que devuelve Gemini en un 429 (confirmado
 * empíricamente contra la API real): SIN header `Retry-After`, con el
 * tiempo sugerido y el tipo de cuota excedida dentro de `error.details[]`.
 */
function geminiQuotaExceededResponse(opts: {
  quotaId: string;
  retryDelaySeconds: number;
}): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: 429,
        message: `Quota exceeded for metric: ${opts.quotaId}`,
        status: 'RESOURCE_EXHAUSTED',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
            violations: [{ quotaId: opts.quotaId }],
          },
          {
            '@type': 'type.googleapis.com/google.rpc.RetryInfo',
            retryDelay: `${opts.retryDelaySeconds}s`,
          },
        ],
      },
    }),
    { status: 429 },
  );
}

describe('AiEngineService.procesarDictadoVoz', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('usa el parser local directamente si no hay GEMINI_API_KEY configurada', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const service = buildService({ GEMINI_API_KEY: undefined });

    const result = await service.procesarDictadoVoz('cinco kilos de papa');

    expect(result.fuente).toBe('REGLAS_LOCALES');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('devuelve fuente GEMINI cuando la primera llamada tiene éxito', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      geminiOkResponse([
        {
          articuloBusqueda: 'papa criolla',
          cantidad: 5,
          unidadDictada: 'KILOGRAMO',
        },
      ]),
    );
    const service = buildService();

    const result = await service.procesarDictadoVoz(
      'cinco kilos de papa criolla',
    );

    expect(result.fuente).toBe('GEMINI');
    expect(result.items).toEqual([
      {
        articuloBusqueda: 'papa criolla',
        cantidad: 5,
        unidadDictada: 'KILOGRAMO',
      },
    ]);
  });

  it('un 429 sin ningún retryDelay reconocible (ni header ni cuerpo) cae al parser local sin reintentar', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() => Promise.resolve(geminiErrorResponse(429)));
    const service = buildService();

    const result = await service.procesarDictadoVoz('cinco kilos de papa');

    expect(result.fuente).toBe('REGLAS_LOCALES');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('un 429 con Retry-After en el HEADER espera ese tiempo y reintenta', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(geminiErrorResponse(429, { 'retry-after': '0' }))
      .mockResolvedValueOnce(
        geminiOkResponse([
          {
            articuloBusqueda: 'arroz',
            cantidad: 2,
            unidadDictada: 'KILOGRAMO',
          },
        ]),
      );
    const service = buildService();

    const result = await service.procesarDictadoVoz('dos kilos de arroz');

    expect(result.fuente).toBe('GEMINI');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  // Regresión real: Gemini NUNCA manda el header Retry-After, el retryDelay
  // sugerido viene en el CUERPO (`error.details[]`). Antes de este fix, esto
  // significaba que NINGÚN 429 de Gemini se reintentaba jamás, ni siquiera
  // los de una cuota corta (por minuto) donde sí valía la pena esperar los
  // pocos segundos que Gemini mismo sugería — cayendo al parser local en el
  // dictado inmediatamente después de uno que sí había usado Gemini.
  it('un 429 con retryDelay en el CUERPO (cuota por minuto, no diaria) espera y reintenta', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        geminiQuotaExceededResponse({
          quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier',
          retryDelaySeconds: 0,
        }),
      )
      .mockResolvedValueOnce(
        geminiOkResponse([
          {
            articuloBusqueda: 'arroz',
            cantidad: 2,
            unidadDictada: 'KILOGRAMO',
          },
        ]),
      );
    const service = buildService();

    const result = await service.procesarDictadoVoz('dos kilos de arroz');

    expect(result.fuente).toBe('GEMINI');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  // Caso real observado en producción/demo: cuota DIARIA agotada
  // (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, límite 20/día en el
  // tier gratuito). Aunque el cuerpo trae un retryDelay corto ("4s"), ningún
  // reintento la libera antes del reset diario — no debe gastar ni un
  // intento, cae directo al parser local.
  it('un 429 por cuota DIARIA agotada no reintenta aunque el cuerpo traiga un retryDelay corto', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve(
        geminiQuotaExceededResponse({
          quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier',
          retryDelaySeconds: 4,
        }),
      ),
    );
    const service = buildService();

    const result = await service.procesarDictadoVoz('cinco kilos de papa');

    expect(result.fuente).toBe('REGLAS_LOCALES');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('un error permanente (400) no se reintenta y cae directo al parser local', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() => Promise.resolve(geminiErrorResponse(400)));
    const service = buildService();

    const result = await service.procesarDictadoVoz('cinco kilos de papa');

    expect(result.fuente).toBe('REGLAS_LOCALES');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('un 500 transitorio se reintenta hasta agotar GEMINI_MAX_RETRIES y luego cae al parser local', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() => Promise.resolve(geminiErrorResponse(500)));
    const service = buildService({
      GEMINI_MAX_RETRIES: 2,
      GEMINI_BASE_DELAY_MS: 1,
    });

    const result = await service.procesarDictadoVoz('cinco kilos de papa');

    expect(result.fuente).toBe('REGLAS_LOCALES');
    expect(fetchSpy).toHaveBeenCalledTimes(3); // intento inicial + 2 reintentos
  });

  it('una respuesta sin "items" válidos cae al parser local', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{}' }] } }],
        }),
        { status: 200 },
      ),
    );
    const service = buildService({ GEMINI_MAX_RETRIES: 0 });

    const result = await service.procesarDictadoVoz('cinco kilos de papa');

    expect(result.fuente).toBe('REGLAS_LOCALES');
  });
});
