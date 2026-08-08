import { Prisma } from '../generated/prisma/client';

/**
 * Predicado de organización para SQL crudo (`$queryRaw`). La extensión de
 * Prisma no puede reescribir SQL, así que en los métodos con `$queryRaw` de
 * `ArticuloRepository`/`ReporteRepository` el aislamiento real lo dan las
 * policies de RLS — este predicado explícito es una segunda capa de
 * claridad y de uso de índice, no la única defensa.
 */
export function alcanceOrg(alias: string, organizacionId: string): Prisma.Sql {
  return Prisma.sql`AND ${Prisma.raw(`"${alias}"."organizacionId"`)} = ${organizacionId}`;
}
