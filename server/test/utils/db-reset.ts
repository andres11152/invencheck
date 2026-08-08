import { PrismaService } from '../../src/prisma/prisma.service';
import { ORGANIZACION_LEGADO_ID } from '../../src/prisma/organizacion-legado';
import { resetearOrganizacionPorDefecto } from './seed-fixtures';

/**
 * Reinicia la BD entre tests. Borrar `organizaciones` alcanza para todo lo
 * de prueba: las 6 tablas de dominio tienen `onDelete: Cascade` hacia
 * `Organizacion` (ver la migración `_organizacion_multi_tenant`), así que la
 * cascada de Postgres hace el mismo trabajo que antes hacían 6
 * `deleteMany()` en orden FK-safe.
 *
 * Se preserva la organización de LEGADO: la crea la migración (no el seed,
 * que no corre en e2e) y `ApiKeyGuard` la asume como destino fijo de los
 * webhooks del ERP (stopgap documentado ahí hasta la Fase 5 — claves API
 * por organización). Si `truncateAll` la borrara, el primer `afterEach` de
 * CUALQUIER spec la eliminaría para siempre en esta corrida y
 * `integration-webhook.e2e-spec.ts` empezaría a fallar con una violación de
 * FK en el resto de la suite.
 */
export async function truncateAll(prisma: PrismaService): Promise<void> {
  await prisma.sinAlcanceDeOrganizacion('e2e: reset de BD entre tests', () =>
    prisma.organizacion.deleteMany({
      where: { id: { not: ORGANIZACION_LEGADO_ID } },
    }),
  );
  resetearOrganizacionPorDefecto(prisma);
}
