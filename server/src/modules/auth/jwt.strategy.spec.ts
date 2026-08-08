import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import type { AuthService } from './auth.service';
import { ContextoOrganizacionService } from '../../prisma/contexto-organizacion.service';
import type {
  AuthenticatedUser,
  JwtPayload,
} from './interfaces/jwt-payload.interface';
import { RolUsuario } from '../../generated/prisma/client';
import type { EnvironmentVariables } from '../../config/env.validation';

describe('JwtStrategy', () => {
  const usuario: AuthenticatedUser = {
    id: 'u1',
    email: 'op@demo.com',
    nombre: 'Op',
    rol: RolUsuario.OPERARIO,
    organizacionId: 'org-1',
  };
  const payload: JwtPayload = {
    sub: 'u1',
    email: 'op@demo.com',
    rol: RolUsuario.OPERARIO,
    org: 'org-1',
  };

  function buildStrategy(validateUserById: jest.Mock) {
    const authService = { validateUserById } as unknown as AuthService;
    const configService = {
      get: jest.fn().mockReturnValue('test-secret-solo-para-esta-suite'),
    } as unknown as ConfigService<EnvironmentVariables, true>;
    const contexto = new ContextoOrganizacionService();
    return {
      strategy: new JwtStrategy(authService, contexto, configService),
      contexto,
    };
  }

  it('revalida contra la BD y devuelve el usuario autenticado si sigue activo', async () => {
    const { strategy, contexto } = buildStrategy(
      jest.fn().mockResolvedValue(usuario),
    );

    // JwtStrategy.validate asume que ya corre dentro de un alcance abierto
    // (lo abre AlcanceOrganizacionMiddleware en producción) y solo lo
    // completa con `asignar()`.
    const result = await contexto.ejecutar({}, () =>
      strategy.validate(payload),
    );

    expect(result).toEqual(usuario);
  });

  it('rechaza con 401 si el usuario ya no existe o fue desactivado', async () => {
    const { strategy, contexto } = buildStrategy(
      jest.fn().mockResolvedValue(null),
    );

    await expect(
      contexto.ejecutar({}, () => strategy.validate(payload)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
