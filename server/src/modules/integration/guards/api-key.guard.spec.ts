import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

function buildContext(headers: Record<string, string | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe('ApiKeyGuard', () => {
  const ORIGINAL_ENV = process.env.ERP_WEBHOOK_API_KEY;

  afterEach(() => {
    process.env.ERP_WEBHOOK_API_KEY = ORIGINAL_ENV;
  });

  it('rechaza si ERP_WEBHOOK_API_KEY no está configurado en el servidor', () => {
    delete process.env.ERP_WEBHOOK_API_KEY;
    const guard = new ApiKeyGuard();

    expect(() => guard.canActivate(buildContext({ 'x-api-key': 'cualquiera' }))).toThrow(
      UnauthorizedException,
    );
  });

  it('rechaza si falta el header X-Api-Key', () => {
    process.env.ERP_WEBHOOK_API_KEY = 'la-key-correcta';
    const guard = new ApiKeyGuard();

    expect(() => guard.canActivate(buildContext({}))).toThrow(UnauthorizedException);
  });

  it('rechaza si la key no coincide', () => {
    process.env.ERP_WEBHOOK_API_KEY = 'la-key-correcta';
    const guard = new ApiKeyGuard();

    expect(() =>
      guard.canActivate(buildContext({ 'x-api-key': 'otra-key' })),
    ).toThrow(UnauthorizedException);
  });

  it('permite el acceso si la key coincide', () => {
    process.env.ERP_WEBHOOK_API_KEY = 'la-key-correcta';
    const guard = new ApiKeyGuard();

    expect(
      guard.canActivate(buildContext({ 'x-api-key': 'la-key-correcta' })),
    ).toBe(true);
  });
});
