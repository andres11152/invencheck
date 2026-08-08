import type { RolUsuario } from '../../../generated/prisma/client';

/** Claims firmados dentro del JWT. */
export interface JwtPayload {
  sub: string;
  email: string;
  rol: RolUsuario;
  /** Organización del usuario — `JwtStrategy.validate` la usa para abrir el alcance ANTES de tocar la BD. */
  org: string;
}

/** Forma de `request.user` una vez que JwtStrategy valida el token. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  nombre: string;
  rol: RolUsuario;
  organizacionId: string;
}
