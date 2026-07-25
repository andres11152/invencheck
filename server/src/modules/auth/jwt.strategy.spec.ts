import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import type { AuthService } from './auth.service';
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
  };
  const payload: JwtPayload = {
    sub: 'u1',
    email: 'op@demo.com',
    rol: RolUsuario.OPERARIO,
  };

  function buildStrategy(validateUserById: jest.Mock) {
    const authService = { validateUserById } as unknown as AuthService;
    const configService = {
      get: jest.fn().mockReturnValue('test-secret-solo-para-esta-suite'),
    } as unknown as ConfigService<EnvironmentVariables, true>;
    return new JwtStrategy(authService, configService);
  }

  it('revalida contra la BD y devuelve el usuario autenticado si sigue activo', async () => {
    const strategy = buildStrategy(jest.fn().mockResolvedValue(usuario));

    const result = await strategy.validate(payload);

    expect(result).toEqual(usuario);
  });

  it('rechaza con 401 si el usuario ya no existe o fue desactivado', async () => {
    const strategy = buildStrategy(jest.fn().mockResolvedValue(null));

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
