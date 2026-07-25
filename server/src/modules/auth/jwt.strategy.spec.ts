import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import type { AuthService } from './auth.service';
import type {
  AuthenticatedUser,
  JwtPayload,
} from './interfaces/jwt-payload.interface';
import { RolUsuario } from '../../generated/prisma/client';

describe('JwtStrategy', () => {
  const ORIGINAL_SECRET = process.env.JWT_SECRET;

  beforeEach(() => {
    // El constructor de JwtStrategy lee JWT_SECRET directamente de
    // process.env y lanza si falta — solo importa al instanciar, no al
    // importar el módulo (el mixin de PassportStrategy no lo toca).
    process.env.JWT_SECRET = 'test-secret-solo-para-esta-suite';
  });

  afterEach(() => {
    process.env.JWT_SECRET = ORIGINAL_SECRET;
  });

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
    return new JwtStrategy(authService);
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

  it('lanza al construirse si JWT_SECRET no está configurado', () => {
    delete process.env.JWT_SECRET;

    expect(() => buildStrategy(jest.fn())).toThrow(/JWT_SECRET/);
  });
});
