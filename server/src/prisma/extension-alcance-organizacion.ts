import { Prisma } from '../generated/prisma/client';
import type { ContextoOrganizacionService } from './contexto-organizacion.service';

/**
 * Operaciones que reciben un `where` y deben quedar acotadas a la
 * organización actual.
 */
const OPERACIONES_CON_WHERE = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
]);

/**
 * Forma mínima y no-`any` que necesitan estos operadores — el shape real de
 * `args` varía por operación/modelo (lo tipa Prisma internamente), así que
 * se accede vía este cast puntual en vez de `Record<string, any>`.
 */
interface ArgsMutables {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> | Record<string, unknown>[];
  create?: Record<string, unknown>;
}

/**
 * Extensión de Prisma: la capa de CONVENIENCIA del aislamiento multi-tenant
 * (la capa de ENFORCEMENT real son las policies de Row Level Security, ver
 * la migración `_rls_aislamiento_organizacion`). Inyecta `organizacionId` en
 * cada consulta y falla ruidosamente si no hay contexto — para que una ruta
 * nueva mal cableada se vea como el bug que es, en vez de como "no hay
 * datos".
 *
 * Carve-out deliberado en `upsert`: NO se toca su `where`. Agregarle un
 * filtro no-único haría que Prisma abandone el `INSERT ... ON CONFLICT`
 * nativo de Postgres, y `InventarioRepository.incrementarConteo` /
 * `marcarUnidadAmbigua` dependen de que ese conflicto lo resuelva la base
 * atómicamente para evitar el lost-update entre dictados concurrentes (ver
 * los comentarios en ese archivo). No hace falta de todos modos:
 * `@@unique([inventarioId, articuloId])` ya es tenant-safe porque
 * `inventarioId` es un cuid único a nivel global.
 *
 * Limitación conocida: no recorre escrituras anidadas (`data.items.create`,
 * `connectOrCreate`) — hoy el código base no usa ninguna (todos los writes
 * pasan ids escalares de FK). Si eso cambiara, RLS `WITH CHECK` lo rechaza
 * de todos modos.
 */
export function extensionAlcanceOrganizacion(
  contexto: ContextoOrganizacionService,
) {
  return Prisma.defineExtension({
    name: 'alcance-organizacion',
    query: {
      $allModels: {
        async $allOperations({ operation, args, query }) {
          const alcance = contexto.actual();
          if (alcance?.omitirAislamiento) return query(args);

          const organizacionId = alcance?.organizacionId;
          if (!organizacionId) {
            throw new Error(
              `Consulta Prisma (${operation}) sin contexto de organización. ` +
                'Verifica que la request pase por AlcanceOrganizacionMiddleware ' +
                'y por JwtStrategy/ApiKeyGuard, o usa ' +
                'PrismaService.sinAlcanceDeOrganizacion() si es legítimamente ' +
                'cross-tenant.',
            );
          }

          // `a` y `args` son la MISMA referencia — este cast solo le da un
          // tipo no-`any` a las propiedades que se mutan abajo, así que
          // `query(args)` más adelante ya ve los cambios sin necesitar
          // reconstruir el objeto.
          const a = args as ArgsMutables;

          if (OPERACIONES_CON_WHERE.has(operation)) {
            a.where = { ...a.where, organizacionId };
          }
          if (operation === 'create') {
            a.data = { ...a.data, organizacionId };
          }
          if (operation === 'createMany') {
            const filas = Array.isArray(a.data) ? a.data : [a.data ?? {}];
            a.data = filas.map((fila) => ({ ...fila, organizacionId }));
          }
          if (operation === 'upsert') {
            a.create = { ...a.create, organizacionId };
          }

          return query(args);
        },
      },
    },
  });
}
