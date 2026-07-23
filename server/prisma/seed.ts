import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  RolUsuario,
  UnidadMedida,
} from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Solo para desarrollo local: cámbialas antes de sembrar cualquier ambiente real. */
const USUARIOS_DEMO = [
  { nombre: 'Ana Operaria', email: 'operario@invencheck.demo', password: 'operario123', rol: RolUsuario.OPERARIO },
  { nombre: 'Carlos Auditor', email: 'auditor@invencheck.demo', password: 'auditor123', rol: RolUsuario.AUDITOR },
  { nombre: 'Admin InvenCheck', email: 'admin@invencheck.demo', password: 'admin123', rol: RolUsuario.ADMIN },
];

async function main() {
  // Reinicia el dominio para que el seed sea reproducible en local.
  await prisma.recetaItem.deleteMany();
  await prisma.receta.deleteMany();
  await prisma.alertaInventario.deleteMany();
  await prisma.itemInventario.deleteMany();
  await prisma.inventario.deleteMany();
  await prisma.articulo.deleteMany();
  await prisma.almacen.deleteMany();
  await prisma.usuario.deleteMany();

  await Promise.all(
    USUARIOS_DEMO.map(async (u) =>
      prisma.usuario.create({
        data: {
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
        codigo: 'BOD-PISCILAGO-01',
        nombre: 'Bodega Principal Piscilago',
        unidad: 'Piscilago',
      },
    }),
    prisma.almacen.create({
      data: {
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
          nombre: 'AJI CASERO PISCILAGO (PA)',
          aliases: ['aji casero', 'aji piscilago'],
          categoria: 'Salsas y Aderezos',
          unidadEstd: UnidadMedida.LITRO,
          esProcesado: true,
        },
      }),
      // 3. Sin SKU: caso real de ~260 artículos sin código en Colsubsidio.
      prisma.articulo.create({
        data: {
          nombre: 'CERVEZA HEINEKEN CERO',
          aliases: ['heineken cero', 'cerveza sin alcohol'],
          categoria: 'Bebidas',
          unidadEstd: UnidadMedida.UNIDAD,
        },
      }),
      // 4. Con stock histórico, para probar detección de desviaciones (> 40%).
      prisma.articulo.create({
        data: {
          sku: '7701112223334',
          nombre: 'PECHUGA DE POLLO',
          aliases: ['pechuga', 'pechuga de pollo'],
          categoria: 'Carnes',
          unidadEstd: UnidadMedida.KILOGRAMO,
          stockHistoricoAvg: 48.5,
        },
      }),
      // 5. Insumo por kg, usado en la receta de prueba.
      prisma.articulo.create({
        data: {
          sku: '7700998877665',
          nombre: 'PAPA CRIOLLA',
          aliases: ['papa criolla', 'papa amarilla'],
          categoria: 'Verduras',
          unidadEstd: UnidadMedida.KILOGRAMO,
        },
      }),
    ]);

  const ajiaco = await prisma.receta.create({
    data: {
      nombre: 'Ajiaco Santafereño x 50 porciones',
      porciones: 50,
      items: {
        create: [
          {
            articuloId: papaCriolla.id,
            cantidadPorPorcion: 0.15,
            unidad: UnidadMedida.KILOGRAMO,
          },
          {
            articuloId: pechugaPollo.id,
            cantidadPorPorcion: 0.12,
            unidad: UnidadMedida.KILOGRAMO,
          },
        ],
      },
    },
  });

  console.log('Seed completado:');
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
  console.log('  Receta:', ajiaco.nombre);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
