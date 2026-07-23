import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Exime una ruta del JwtAuthGuard global (ej. login, o endpoints de un sistema externo). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
