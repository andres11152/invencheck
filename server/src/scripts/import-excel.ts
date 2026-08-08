import 'dotenv/config';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { Logger } from '@nestjs/common';
import { ContextoOrganizacionService } from '../prisma/contexto-organizacion.service';
import { extensionAlcanceOrganizacion } from '../prisma/extension-alcance-organizacion';
import { ORGANIZACION_LEGADO_SLUG } from '../prisma/organizacion-legado';
import { PrismaService } from '../prisma/prisma.service';
import { AlmacenRepository } from '../modules/almacenes/almacen.repository';
import type { AlmacenUpsertInput } from '../modules/almacenes/almacen.repository';
import { ArticuloRepository } from '../modules/articulos/articulo.repository';
import type { ArticuloUpsertInput } from '../modules/articulos/articulo.repository';
import { buildAliases } from '../modules/articulos/articulo-text.util';
import { collapseWhitespace, stripAccents } from '../common/utils/text.util';
import { UnidadMedida } from '../generated/prisma/client';

const logger = new Logger('ImportExcel');

const XLSX_PATH = resolve(__dirname, '../../data/BODEGAS Y STOCK.xlsx');
const BODEGAS_SHEET = 'BODEGAS DISPONIBLES';

/** Nombre de hoja (normalizado) -> categoría de catálogo. */
const SHEET_CATEGORY_MAP: Record<string, string> = {
  'STOCK ALMACEN SUMINISTROS': 'Suministros',
  'STOCK ALMACEN AYB': 'AYB',
  'STOCK RESTAURANTE FUENTES AYB': 'AYB',
  'STOCK RESTAURANTE FUENTES SUMIN': 'Suministros',
  'STOCK KIOSCO TAQUILLA AYB': 'AYB',
  'STOCK KIOSCO PISCIGIROS AYB': 'AYB',
  ZOOLOGICO: 'Zoológico',
  'ZOOLOGICO SUMINISTROS': 'Zoológico',
};

const UNIT_MAP: Record<string, UnidadMedida> = {
  liter: UnidadMedida.LITRO,
  litre: UnidadMedida.LITRO,
  litro: UnidadMedida.LITRO,
  litros: UnidadMedida.LITRO,
  kilogram: UnidadMedida.KILOGRAMO,
  kilogramo: UnidadMedida.KILOGRAMO,
  kilo: UnidadMedida.KILOGRAMO,
  kilos: UnidadMedida.KILOGRAMO,
  gram: UnidadMedida.GRAMO,
  gramo: UnidadMedida.GRAMO,
  gramos: UnidadMedida.GRAMO,
  mililitro: UnidadMedida.MILILITRO,
  milliliter: UnidadMedida.MILILITRO,
  unidad: UnidadMedida.UNIDAD,
  unidades: UnidadMedida.UNIDAD,
  unit: UnidadMedida.UNIDAD,
  units: UnidadMedida.UNIDAD,
  portion: UnidadMedida.PORCION,
  porcion: UnidadMedida.PORCION,
  canastilla: UnidadMedida.CANASTILLA,
  caja: UnidadMedida.CAJA,
};

function normalizeSheetName(name: string): string {
  return collapseWhitespace(name).toUpperCase();
}

/** Convierte solo valores realmente representables como texto (evita "[object Object]" en celdas fórmula/rich-text). */
function primitiveToString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return null;
}

function normalizeUnidad(raw: unknown): UnidadMedida {
  const text = primitiveToString(raw);
  if (!text) return UnidadMedida.UNIDAD;
  const key = stripAccents(text).trim().toLowerCase();
  if (!key) return UnidadMedida.UNIDAD;
  return UNIT_MAP[key] ?? UnidadMedida.UNIDAD;
}

function cellText(value: ExcelJS.CellValue): string | null {
  const raw = primitiveToString(value);
  if (raw === null) return null;
  const text = collapseWhitespace(raw);
  return text === '' ? null : text;
}

function cellNumber(value: ExcelJS.CellValue): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isTotalRow(nombre: string): boolean {
  return /^total\b/i.test(nombre);
}

// ---------------------------------------------------------------------------
// Almacenes (Sheet BODEGAS DISPONIBLES)
// ---------------------------------------------------------------------------

function slugifyCodigo(nombre: string): string {
  return stripAccents(nombre)
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function deriveUnidadNegocio(nombre: string): string {
  const n = stripAccents(nombre).toLowerCase();
  return /hotel|fuentes|\bayb\b/.test(n) ? 'Hoteles' : 'Piscilago';
}

function parseAlmacenes(workbook: ExcelJS.Workbook): AlmacenUpsertInput[] {
  const sheet = workbook.getWorksheet(BODEGAS_SHEET);
  if (!sheet) {
    throw new Error(`No se encontró la hoja "${BODEGAS_SHEET}"`);
  }

  const codigosUsados = new Map<string, number>();
  const almacenes: AlmacenUpsertInput[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < 3) return; // filas 1-2 son encabezado
    const nombre = cellText(row.getCell(3).value);
    if (!nombre) return;

    let codigo = slugifyCodigo(nombre);
    const previousCount = codigosUsados.get(codigo) ?? 0;
    codigosUsados.set(codigo, previousCount + 1);
    if (previousCount > 0) codigo = `${codigo}-${previousCount + 1}`;

    almacenes.push({ codigo, nombre, unidad: deriveUnidadNegocio(nombre) });
  });

  return almacenes;
}

// ---------------------------------------------------------------------------
// Artículos y stock histórico (hojas STOCK ... / ZOOLOGICO ...)
// ---------------------------------------------------------------------------

interface RawStockRow {
  sku: string | null;
  nombre: string;
  categoria: string;
  unidadRaw: unknown;
  sd: number | null;
}

function parseStockSheet(sheet: ExcelJS.Worksheet): RawStockRow[] {
  const categoria =
    SHEET_CATEGORY_MAP[normalizeSheetName(sheet.name)] ??
    collapseWhitespace(sheet.name);
  const rows: RawStockRow[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < 2) return; // fila 1 es encabezado
    const nombre = cellText(row.getCell(3).value);
    if (!nombre || isTotalRow(nombre)) return; // vacíos y filas "TOTAL ARTICULO"

    rows.push({
      sku: cellText(row.getCell(2).value),
      nombre,
      categoria,
      unidadRaw: row.getCell(4).value,
      sd: cellNumber(row.getCell(5).value),
    });
  });

  return rows;
}

function groupKey(row: RawStockRow): string {
  // Se agrupa siempre por nombre (clave única del catálogo): un mismo
  // artículo puede traer sku en una hoja y no traerlo en otra, y agrupar
  // por sku cuando está presente produciría dos grupos con el mismo
  // nombre -> violación del unique en `articulos.nombre` al hacer upsert.
  return row.nombre.toUpperCase();
}

function reduceGroup(rows: RawStockRow[]): ArticuloUpsertInput {
  const first = rows[0];
  const sku = rows.find((r) => r.sku)?.sku ?? null;
  // Primera hoja (en orden del libro) donde aparece el artículo define su categoría.
  const categoria = first.categoria;
  const unidadRaw = rows.find((r) => r.unidadRaw)?.unidadRaw ?? null;
  const esProcesado = rows.some((r) => /\(pa\)/i.test(r.nombre));

  // Stock negativo (ERP) no debe sesgar el promedio histórico: cuenta como 0.
  const sdReadings = rows
    .map((r) => r.sd)
    .filter((sd): sd is number => sd !== null)
    .map((sd) => (sd < 0 ? 0 : sd));
  const stockHistoricoAvg =
    sdReadings.length > 0
      ? sdReadings.reduce((sum, v) => sum + v, 0) / sdReadings.length
      : null;

  return {
    sku,
    nombre: first.nombre,
    aliases: buildAliases(first.nombre),
    categoria,
    unidadEstd: normalizeUnidad(unidadRaw),
    esProcesado,
    stockHistoricoAvg,
  };
}

function parseArticulos(workbook: ExcelJS.Workbook): ArticuloUpsertInput[] {
  const grupos = new Map<string, RawStockRow[]>();

  for (const sheet of workbook.worksheets) {
    if (normalizeSheetName(sheet.name) === BODEGAS_SHEET) continue;
    for (const row of parseStockSheet(sheet)) {
      const key = groupKey(row);
      const existing = grupos.get(key);
      if (existing) existing.push(row);
      else grupos.set(key, [row]);
    }
  }

  const articulos = [...grupos.values()].map(reduceGroup);
  return dedupeSkusAcrossGroups(articulos);
}

/**
 * Defensa adicional: si el mismo sku aparece bajo dos nombres distintos
 * (inconsistencia entre hojas), solo el primero conserva el sku -> evita
 * violar el unique de `articulos.sku` al hacer upsert.
 */
function dedupeSkusAcrossGroups(
  articulos: ArticuloUpsertInput[],
): ArticuloUpsertInput[] {
  const skusVistos = new Set<string>();
  return articulos.map((articulo) => {
    if (!articulo.sku) return articulo;
    if (skusVistos.has(articulo.sku)) {
      logger.warn(
        `SKU duplicado entre artículos con nombres distintos, se descarta en "${articulo.nombre}": ${articulo.sku}`,
      );
      return { ...articulo, sku: null };
    }
    skusVistos.add(articulo.sku);
    return articulo;
  });
}

// ---------------------------------------------------------------------------
// Orquestación
// ---------------------------------------------------------------------------

/** `--organizacion=<slug>` — default al slug de la organización de legado (uso local sin flag). */
function leerOrganizacionSlug(): string {
  const flag = process.argv.find((arg) => arg.startsWith('--organizacion='));
  return flag ? flag.slice('--organizacion='.length) : ORGANIZACION_LEGADO_SLUG;
}

async function main() {
  logger.log(`Leyendo ${XLSX_PATH}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(XLSX_PATH);

  const almacenes = parseAlmacenes(workbook);
  const articulos = parseArticulos(workbook);
  logger.log(
    `Parseados ${almacenes.length} almacenes y ${articulos.length} artículos únicos`,
  );

  // Instanciación directa (sin contenedor de Nest): tsx/esbuild no emite
  // `design:paramtypes`, por lo que la inyección por decoradores no aplica
  // en scripts CLI standalone. Los repositorios son clases simples, así
  // que se construyen a mano reutilizando exactamente la misma lógica de
  // upsert que usa la capa REST — incluida la extensión de alcance por
  // organización, para que este script escriba con las mismas garantías
  // que un request HTTP real.
  const contexto = new ContextoOrganizacionService();
  const prisma = new PrismaService(contexto);
  const prismaOrg = prisma.$extends(extensionAlcanceOrganizacion(contexto));
  const almacenRepository = new AlmacenRepository(prismaOrg, contexto);
  const articuloRepository = new ArticuloRepository(prismaOrg, contexto);

  const slug = leerOrganizacionSlug();

  try {
    // Lookup cross-tenant legítimo: el slug identifica la organización
    // ANTES de poder abrir el alcance, igual que el email en el login.
    const organizacion = await prisma.sinAlcanceDeOrganizacion(
      `import-excel: resolver organización por slug "${slug}"`,
      () => prisma.organizacion.findUnique({ where: { slug } }),
    );
    if (!organizacion) {
      throw new Error(
        `No existe ninguna organización con slug "${slug}". Pásala con --organizacion=<slug>.`,
      );
    }
    logger.log(`Organización destino: ${organizacion.nombre} (${slug})`);

    await contexto.ejecutarConOrganizacion(organizacion.id, async () => {
      const almacenesUpserted = await almacenRepository.upsertMany(almacenes);
      logger.log(`Almacenes upsertados: ${almacenesUpserted}`);

      const articulosUpserted = await articuloRepository.upsertMany(articulos);
      logger.log(`Artículos upsertados: ${articulosUpserted}`);

      const [totalAlmacenes, totalArticulos, totalProcesados] =
        await Promise.all([
          almacenRepository.count(),
          articuloRepository.count(),
          articuloRepository.count({ esProcesado: true }),
        ]);

      logger.log('--- Resumen final en PostgreSQL ---');
      logger.log(`Almacenes registrados: ${totalAlmacenes}`);
      logger.log(`Artículos registrados: ${totalArticulos}`);
      logger.log(`  · de los cuales procesados (PA): ${totalProcesados}`);
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  logger.error(err);
  process.exitCode = 1;
});
