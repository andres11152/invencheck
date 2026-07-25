import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  RolUsuario,
  UnidadMedida,
  type Almacen,
  type Articulo,
  type Usuario,
} from '../../src/generated/prisma/client';

/** Builders programáticos mínimos para specs autocontenidos (no dependen de `prisma/seed.ts`). */

export interface CrearUsuarioDemoResult {
  usuario: Usuario;
  password: string;
}

export async function crearUsuarioDemo(
  prisma: PrismaService,
  rol: RolUsuario = RolUsuario.OPERARIO,
): Promise<CrearUsuarioDemoResult> {
  const password = 'test-password-123';
  const sufijo = randomUUID().slice(0, 8);
  const usuario = await prisma.usuario.create({
    data: {
      nombre: `Usuario Test ${rol}`,
      email: `test-${rol.toLowerCase()}-${sufijo}@invencheck.test`,
      passwordHash: await bcrypt.hash(password, 10),
      rol,
    },
  });
  return { usuario, password };
}

export function crearAlmacen(
  prisma: PrismaService,
  overrides: Partial<{ codigo: string; nombre: string; unidad: string }> = {},
): Promise<Almacen> {
  const sufijo = randomUUID().slice(0, 8);
  return prisma.almacen.create({
    data: {
      codigo: overrides.codigo ?? `BOD-TEST-${sufijo}`,
      nombre: overrides.nombre ?? `Bodega Test ${sufijo}`,
      unidad: overrides.unidad ?? 'Test',
    },
  });
}

export function crearArticulo(
  prisma: PrismaService,
  overrides: Partial<{
    sku: string | null;
    nombre: string;
    aliases: string[];
    categoria: string;
    unidadEstd: UnidadMedida;
    esProcesado: boolean;
    stockHistoricoAvg: number | null;
  }> = {},
): Promise<Articulo> {
  const sufijo = randomUUID().slice(0, 8);
  return prisma.articulo.create({
    data: {
      sku: overrides.sku ?? null,
      nombre: overrides.nombre ?? `ARTICULO TEST ${sufijo}`,
      aliases: overrides.aliases ?? [],
      categoria: overrides.categoria ?? 'Test',
      unidadEstd: overrides.unidadEstd ?? UnidadMedida.UNIDAD,
      esProcesado: overrides.esProcesado ?? false,
      stockHistoricoAvg: overrides.stockHistoricoAvg ?? null,
    },
  });
}
