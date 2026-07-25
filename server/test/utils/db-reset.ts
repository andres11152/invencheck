import { PrismaService } from '../../src/prisma/prisma.service';

/** Orden FK-safe, igual que `server/prisma/seed.ts`. */
export async function truncateAll(prisma: PrismaService): Promise<void> {
  await prisma.alertaInventario.deleteMany();
  await prisma.itemInventario.deleteMany();
  await prisma.inventario.deleteMany();
  await prisma.articulo.deleteMany();
  await prisma.almacen.deleteMany();
  await prisma.usuario.deleteMany();
}
