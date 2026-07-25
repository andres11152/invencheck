import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const base = {
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    JWT_SECRET: 'un-secreto-largo',
    ERP_WEBHOOK_API_KEY: 'una-key',
  };

  it('acepta la configuración mínima requerida', () => {
    expect(() => validateEnv(base)).not.toThrow();
  });

  it('lanza si falta JWT_SECRET', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: base.DATABASE_URL,
        ERP_WEBHOOK_API_KEY: base.ERP_WEBHOOK_API_KEY,
      }),
    ).toThrow();
  });

  it('lanza si falta ERP_WEBHOOK_API_KEY', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: base.DATABASE_URL,
        JWT_SECRET: base.JWT_SECRET,
      }),
    ).toThrow();
  });

  it('lanza si falta DATABASE_URL', () => {
    expect(() =>
      validateEnv({
        JWT_SECRET: base.JWT_SECRET,
        ERP_WEBHOOK_API_KEY: base.ERP_WEBHOOK_API_KEY,
      }),
    ).toThrow();
  });

  it('lanza si GEMINI_MAX_RETRIES no es un entero válido', () => {
    expect(() =>
      validateEnv({ ...base, GEMINI_MAX_RETRIES: 'no-es-numero' }),
    ).toThrow();
  });

  it('lanza si GEMINI_MAX_RETRIES es negativo', () => {
    expect(() => validateEnv({ ...base, GEMINI_MAX_RETRIES: '-1' })).toThrow();
  });

  it('acepta y castea GEMINI_MAX_RETRIES numérico a number', () => {
    const result = validateEnv({ ...base, GEMINI_MAX_RETRIES: '5' });
    expect(result.GEMINI_MAX_RETRIES).toBe(5);
  });

  it('deja las opcionales sin definir cuando no se pasan', () => {
    const result = validateEnv(base);
    expect(result.GEMINI_API_KEY).toBeUndefined();
    expect(result.CORS_ORIGIN).toBeUndefined();
  });
});
