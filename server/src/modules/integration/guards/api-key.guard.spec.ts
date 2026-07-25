import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ApiKeyGuard } from './api-key.guard';
import type { EnvironmentVariables } from '../../../config/env.validation';

function buildContext(
  headers: Record<string, string | undefined>,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

function buildGuard(expectedKey: string) {
  const configService = {
    get: jest.fn().mockReturnValue(expectedKey),
  } as unknown as ConfigService<EnvironmentVariables, true>;
  return new ApiKeyGuard(configService);
}

describe('ApiKeyGuard', () => {
  it('rechaza si falta el header X-Api-Key', () => {
    const guard = buildGuard('la-key-correcta');

    expect(() => guard.canActivate(buildContext({}))).toThrow(
      UnauthorizedException,
    );
  });

  it('rechaza si la key no coincide', () => {
    const guard = buildGuard('la-key-correcta');

    expect(() =>
      guard.canActivate(buildContext({ 'x-api-key': 'otra-key' })),
    ).toThrow(UnauthorizedException);
  });

  it('permite el acceso si la key coincide', () => {
    const guard = buildGuard('la-key-correcta');

    expect(
      guard.canActivate(buildContext({ 'x-api-key': 'la-key-correcta' })),
    ).toBe(true);
  });
});
