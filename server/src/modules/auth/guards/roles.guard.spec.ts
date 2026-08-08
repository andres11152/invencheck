import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { RolUsuario } from '../../../generated/prisma/client';
import type { AuthenticatedUser } from '../interfaces/jwt-payload.interface';

function buildContext(user: AuthenticatedUser): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  function buildGuard(rolesRequeridos: RolUsuario[] | undefined) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(rolesRequeridos),
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  }

  const operario: AuthenticatedUser = {
    id: '1',
    email: 'op@demo.com',
    nombre: 'Op',
    rol: RolUsuario.OPERARIO,
    organizacionId: 'org-test-1',
  };
  const auditor: AuthenticatedUser = {
    id: '2',
    email: 'aud@demo.com',
    nombre: 'Aud',
    rol: RolUsuario.AUDITOR,
    organizacionId: 'org-test-1',
  };

  it('permite el acceso si la ruta no declara @Roles()', () => {
    const guard = buildGuard(undefined);
    expect(guard.canActivate(buildContext(operario))).toBe(true);
  });

  it('permite el acceso si @Roles() está vacío', () => {
    const guard = buildGuard([]);
    expect(guard.canActivate(buildContext(operario))).toBe(true);
  });

  it('bloquea a un usuario cuyo rol no está en la lista requerida', () => {
    const guard = buildGuard([RolUsuario.AUDITOR, RolUsuario.ADMIN]);
    expect(guard.canActivate(buildContext(operario))).toBe(false);
  });

  it('permite a un usuario cuyo rol sí está en la lista requerida', () => {
    const guard = buildGuard([RolUsuario.AUDITOR, RolUsuario.ADMIN]);
    expect(guard.canActivate(buildContext(auditor))).toBe(true);
  });
});
