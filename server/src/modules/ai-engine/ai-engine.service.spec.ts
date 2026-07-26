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

  it('un 429 sin Retry-After cae al parser local sin reintentar (no tiene sentido esperar poco tiempo por una cuota que resetea por minuto)', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() => Promise.resolve(geminiErrorResponse(429)));
    const service = buildService();

    const result = await service.procesarDictadoVoz('cinco kilos de papa');

    expect(result.fuente).toBe('REGLAS_LOCALES');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('un 429 con Retry-After espera ese tiempo y reintenta', async () => {
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
