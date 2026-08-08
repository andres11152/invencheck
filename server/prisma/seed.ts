import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PlanOrganizacion,
  PrismaClient,
  RolUsuario,
  UnidadMedida,
} from '../src/generated/prisma/client';
import {
  ORGANIZACION_LEGADO_ID,
  ORGANIZACION_LEGADO_SLUG,
} from '../src/prisma/organizacion-legado';

// Rol DUEÑO de las tablas (se salta RLS) — igual que `prisma migrate deploy`,
// el seed necesita escribir en cualquier organización sin que las policies
// se lo impidan. `DATABASE_URL` (rol invencheck_app, sin privilegios) es
// solo para el proceso de NestJS, ver server/.env.example.
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString:
      process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL,
  }),
});

/** Solo para desarrollo local: cámbialas antes de sembrar cualquier ambiente real. */
const USUARIOS_DEMO = [
  { nombre: 'Ana Operaria', email: 'operario@invencheck.demo', password: 'operario123', rol: RolUsuario.OPERARIO },
  { nombre: 'Carlos Auditor', email: 'auditor@invencheck.demo', password: 'auditor123', rol: RolUsuario.AUDITOR },
  { nombre: 'Admin InvenCheck', email: 'admin@invencheck.demo', password: 'admin123', rol: RolUsuario.ADMIN },
];

async function main() {
  // Reinicia SOLO la organización de legado (id estable, ver
  // organizacion-legado.ts) para que el seed sea reproducible en local, sin
  // tocar ninguna otra organización creada por registro self-service.
  const filtroLegado = { where: { organizacionId: ORGANIZACION_LEGADO_ID } };
  await prisma.alertaInventario.deleteMany(filtroLegado);
  await prisma.itemInventario.deleteMany(filtroLegado);
  await prisma.inventario.deleteMany(filtroLegado);
  await prisma.articulo.deleteMany(filtroLegado);
  await prisma.almacen.deleteMany(filtroLegado);
  await prisma.usuario.deleteMany(filtroLegado);

  const organizacion = await prisma.organizacion.upsert({
    where: { id: ORGANIZACION_LEGADO_ID },
    update: {},
    create: {
      id: ORGANIZACION_LEGADO_ID,
      nombre: 'Colsubsidio',
      slug: ORGANIZACION_LEGADO_SLUG,
      plan: PlanOrganizacion.ENTERPRISE,
    },
  });
  const organizacionId = organizacion.id;

  await Promise.all(
    USUARIOS_DEMO.map(async (u) =>
      prisma.usuario.create({
        data: {
          organizacionId,
          nombre: u.nombre,
          email: u.email,
          passwordHash: await bcrypt.hash(u.password, 10),
          rol: u.rol,
        },
      }),
    ),
  );

  const [piscilago, fuentesAyb] = await Promise.all([
    prisma.almacen.create({
      data: {
        organizacionId,
        codigo: 'BOD-PISCILAGO-01',
        nombre: 'Bodega Principal Piscilago',
        unidad: 'Piscilago',
      },
    }),
    prisma.almacen.create({
      data: {
        organizacionId,
        codigo: 'REST-FUENTES-AYB',
        nombre: 'Restaurante Fuentes AYB',
        unidad: 'Hoteles',
      },
    }),
  ]);

  const [arrozBlanco, ajiCasero, cervezaHeineken, pechugaPollo, papaCriolla] =
    await Promise.all([
      // 1. Ítem normal, con SKU.
      prisma.articulo.create({
        data: {
          organizacionId,
          sku: '7702001234567',
          nombre: 'ARROZ BLANCO EXCELSO 500G',
          aliases: ['arroz blanco', 'arroz excelso'],
          categoria: 'Abarrotes',
          unidadEstd: UnidadMedida.UNIDAD,
        },
      }),
      // 2. Procesado (PA): preparación de cocina, no insumo crudo.
      prisma.articulo.create({
        data: {
          organizacionId,
          nombre: 'AJI CASERO PISCILAGO (PA)',
          aliases: ['aji casero', 'aji piscilago'],
          categoria: 'Salsas y Aderezos',
          unidadEstd: UnidadMedida.LITRO,
          esProcesado: true,
        },
      }),
      // 3. Sin SKU: caso real de ~260 artículos sin código en el catálogo.
      prisma.articulo.create({
        data: {
          organizacionId,
          nombre: 'CERVEZA HEINEKEN CERO',
          aliases: ['heineken cero', 'cerveza sin alcohol'],
          categoria: 'Bebidas',
          unidadEstd: UnidadMedida.UNIDAD,
        },
      }),
      // 4. Con stock histórico, para probar detección de desviaciones (> 40%).
      prisma.articulo.create({
        data: {
          organizacionId,
          sku: '7701112223334',
          nombre: 'PECHUGA DE POLLO',
          aliases: ['pechuga', 'pechuga de pollo'],
          categoria: 'Carnes',
          unidadEstd: UnidadMedida.KILOGRAMO,
          stockHistoricoAvg: 48.5,
        },
      }),
      // 5. Artículo medido por kg, para probar dictados con conversión de unidad.
      prisma.articulo.create({
        data: {
          organizacionId,
          sku: '7700998877665',
          nombre: 'PAPA CRIOLLA',
          aliases: ['papa criolla', 'papa amarilla'],
          categoria: 'Verduras',
          unidadEstd: UnidadMedida.KILOGRAMO,
        },
      }),
    ]);

  console.log('Seed completado:');
  console.log('  Organización:', `${organizacion.nombre} (${organizacion.slug})`);
  console.log(
    '  Usuarios (login demo):',
    USUARIOS_DEMO.map((u) => `${u.email} / ${u.password} (${u.rol})`),
  );
  console.log('  Almacenes:', [piscilago.nombre, fuentesAyb.nombre]);
  console.log('  Artículos:', [
    arrozBlanco.nombre,
    ajiCasero.nombre,
    cervezaHeineken.nombre,
    pechugaPollo.nombre,
    papaCriolla.nombre,
  ]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
