import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  RolUsuario,
  UnidadMedida,
  type Almacen,
  type Articulo,
  type Organizacion,
  type Usuario,
} from '../../src/generated/prisma/client';

/** Builders programáticos mínimos para specs autocontenidos (no dependen de `prisma/seed.ts`). */

/**
 * Organización "por defecto" de cada test: se crea perezosamente la primera
 * vez que un fixture la necesita, y se reutiliza dentro del mismo test para
 * que un usuario logueado y las bodegas/artículos creados en ese mismo test
 * queden en la MISMA organización — si no, el aislamiento por organización
 * (extensión de Prisma + RLS) haría que el usuario nunca viera sus propios
 * datos de prueba.
 *
 * Cacheada por instancia de `PrismaService` (una por `createTestApp()`, ver
 * `test-app.ts`) y reseteada por `truncateAll` entre tests — así cada `it()`
 * arranca con una organización de prueba nueva, sin que los ~17 specs que ya
 * llaman a estos fixtures sin `organizacionId` explícito tengan que cambiar.
 * Los tests que SÍ necesitan dos organizaciones (aislamiento multi-tenant)
 * usan `crearOrganizacion()` explícitamente y pasan su id.
 */
const organizacionPorDefecto = new WeakMap<PrismaService, Promise<string>>();

async function organizacionIdPorDefecto(
  prisma: PrismaService,
): Promise<string> {
  const cacheada = organizacionPorDefecto.get(prisma);
  if (cacheada) return cacheada;

  const promesa = prisma
    .sinAlcanceDeOrganizacion(
      'e2e: crear organización de prueba por defecto',
      () => crearOrganizacion(prisma),
    )
    .then((org) => org.id);
  organizacionPorDefecto.set(prisma, promesa);
  return promesa;
}

/** Llamado por `truncateAll` entre tests: la organización cacheada ya no existe. */
export function resetearOrganizacionPorDefecto(prisma: PrismaService): void {
  organizacionPorDefecto.delete(prisma);
}

export function crearOrganizacion(
  prisma: PrismaService,
  overrides: Partial<{ nombre: string; slug: string }> = {},
): Promise<Organizacion> {
  const sufijo = randomUUID().slice(0, 8);
  return prisma.sinAlcanceDeOrganizacion(
    'e2e: crear organización de prueba',
    () =>
      prisma.organizacion.create({
        data: {
          nombre: overrides.nombre ?? `Organización Test ${sufijo}`,
          slug: overrides.slug ?? `org-test-${sufijo}`,
        },
      }),
  );
}

export interface CrearUsuarioDemoResult {
  usuario: Usuario;
  password: string;
}

export async function crearUsuarioDemo(
  prisma: PrismaService,
  rol: RolUsuario = RolUsuario.OPERARIO,
  overrides: Partial<{ organizacionId: string }> = {},
): Promise<CrearUsuarioDemoResult> {
  const password = 'test-password-123';
  const sufijo = randomUUID().slice(0, 8);
  const organizacionId =
    overrides.organizacionId ?? (await organizacionIdPorDefecto(prisma));
  const usuario = await prisma.sinAlcanceDeOrganizacion(
    'e2e: crear usuario de prueba',
    () =>
      prisma.usuario.create({
        data: {
          organizacionId,
          nombre: `Usuario Test ${rol}`,
          email: `test-${rol.toLowerCase()}-${sufijo}@invencheck.test`,
          passwordHash: bcrypt.hashSync(password, 10),
          rol,
        },
      }),
  );
  return { usuario, password };
}

export async function crearAlmacen(
  prisma: PrismaService,
  overrides: Partial<{
    codigo: string;
    nombre: string;
    unidad: string;
    organizacionId: string;
  }> = {},
): Promise<Almacen> {
  const sufijo = randomUUID().slice(0, 8);
  const organizacionId =
    overrides.organizacionId ?? (await organizacionIdPorDefecto(prisma));
  return prisma.sinAlcanceDeOrganizacion('e2e: crear bodega de prueba', () =>
    prisma.almacen.create({
      data: {
        organizacionId,
        codigo: overrides.codigo ?? `BOD-TEST-${sufijo}`,
        nombre: overrides.nombre ?? `Bodega Test ${sufijo}`,
        unidad: overrides.unidad ?? 'Test',
      },
    }),
  );
}

export async function crearArticulo(
  prisma: PrismaService,
  overrides: Partial<{
    sku: string | null;
    nombre: string;
    aliases: string[];
    categoria: string;
    unidadEstd: UnidadMedida;
    esProcesado: boolean;
    stockHistoricoAvg: number | null;
    organizacionId: string;
  }> = {},
): Promise<Articulo> {
  const sufijo = randomUUID().slice(0, 8);
  const organizacionId =
    overrides.organizacionId ?? (await organizacionIdPorDefecto(prisma));
  return prisma.sinAlcanceDeOrganizacion('e2e: crear artículo de prueba', () =>
    prisma.articulo.create({
      data: {
        organizacionId,
        sku: overrides.sku ?? null,
        nombre: overrides.nombre ?? `ARTICULO TEST ${sufijo}`,
        aliases: overrides.aliases ?? [],
        categoria: overrides.categoria ?? 'Test',
        unidadEstd: overrides.unidadEstd ?? UnidadMedida.UNIDAD,
        esProcesado: overrides.esProcesado ?? false,
        stockHistoricoAvg: overrides.stockHistoricoAvg ?? null,
      },
    }),
  );
}
