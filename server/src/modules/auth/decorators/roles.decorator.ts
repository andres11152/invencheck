import { SetMetadata } from '@nestjs/common';
import type { RolUsuario } from '../../../generated/prisma/client';

export const ROLES_KEY = 'roles';

/** Restringe una ruta a uno o más roles; requiere RolesGuard además de JwtAuthGuard. */
export const Roles = (...roles: RolUsuario[]) => SetMetadata(ROLES_KEY, roles);
