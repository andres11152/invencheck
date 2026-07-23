import type { RolUsuario } from '../../../generated/prisma/client';

/** Claims firmados dentro del JWT. */
export interface JwtPayload {
  sub: string;
  email: string;
  rol: RolUsuario;
}

/** Forma de `request.user` una vez que JwtStrategy valida el token. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  nombre: string;
  rol: RolUsuario;
}
