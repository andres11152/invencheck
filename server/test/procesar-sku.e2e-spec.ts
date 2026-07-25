import { RolUsuario, UnidadMedida } from '../src/generated/prisma/client';
import {
  closeTestApp,
  createTestApp,
  type TestAppContext,
} from './utils/test-app';
import { truncateAll } from './utils/db-reset';
import { crearAlmacen, crearArticulo } from './utils/seed-fixtures';
import { loginAs } from './utils/auth';
import { agent } from './utils/http';

interface InventarioBody {
  id: string;
}

interface ProcesarResultBody {
  fuenteIA: string;
  itemsMatcheados: Array<{
    articulo: { id: string; nombre: string };
    conteoFisico: number;
    scoreMatch: number;
  }>;
  itemsNoMatcheados: Array<{ articuloBusqueda: string; motivo: string }>;
}

/**
 * Regresión del bug real encontrado en auditoría: el escáner de código de
 * barras armaba un string tipo "1 unidad de sku 12345" y lo mandaba al
 * pipeline de voz (matching difuso por nombre/alias) — un SKU nunca matchea
 * ahí porque `findBestMatches` no compara contra la columna `sku`. Este
 * endpoint resuelve el artículo por SKU exacto, sin ambigüedad.
 */
describe('POST /inventarios/:id/procesar-sku (e2e)', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  afterEach(async () => {
    await truncateAll(ctx.prisma);
  });

  it('resuelve el artículo por SKU exacto, no por similitud de nombre', async () => {
    const operario = await loginAs(ctx, RolUsuario.OPERARIO);
    const almacen = await crearAlmacen(ctx.prisma);

    // Nombre deliberadamente sin ninguna relación textual con "sku" o el
    // código — si el bug original siguiera presente, esto jamás matchearía
    // por nombre/alias.
    const cervezaHeineken = await crearArticulo(ctx.prisma, {
      sku: '7702001234567',
      nombre: 'CERVEZA HEINEKEN CERO',
      aliases: ['heineken cero'],
      categoria: 'Bebidas',
      unidadEstd: UnidadMedida.UNIDAD,
    });

    const inventarioRes = await agent(ctx.app)
      .post('/api/inventarios')
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ almacenId: almacen.id })
      .expect(201);
    const inventario = inventarioRes.body as InventarioBody;

    const res = await agent(ctx.app)
      .post(`/api/inventarios/${inventario.id}/procesar-sku`)
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ sku: '7702001234567', cantidad: 6 })
      .expect(201);
    const body = res.body as ProcesarResultBody;

    expect(body.fuenteIA).toBe('ESCANER_SKU');
    expect(body.itemsMatcheados).toHaveLength(1);
    expect(body.itemsMatcheados[0].articulo.id).toBe(cervezaHeineken.id);
    expect(body.itemsMatcheados[0].conteoFisico).toBe(6);
    expect(body.itemsMatcheados[0].scoreMatch).toBe(1);
    expect(body.itemsNoMatcheados).toHaveLength(0);
  });

  it('un SKU que no existe en el catálogo no matchea nada al azar', async () => {
    const operario = await loginAs(ctx, RolUsuario.OPERARIO);
    const almacen = await crearAlmacen(ctx.prisma);
    await crearArticulo(ctx.prisma, {
      sku: '111111',
      nombre: 'ARROZ BLANCO EXCELSO',
      categoria: 'Abarrotes',
    });

    const inventarioRes = await agent(ctx.app)
      .post('/api/inventarios')
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ almacenId: almacen.id })
      .expect(201);
    const inventario = inventarioRes.body as InventarioBody;

    const res = await agent(ctx.app)
      .post(`/api/inventarios/${inventario.id}/procesar-sku`)
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ sku: '999999-no-existe', cantidad: 1 })
      .expect(201);
    const body = res.body as ProcesarResultBody;

    expect(body.itemsMatcheados).toHaveLength(0);
    expect(body.itemsNoMatcheados).toHaveLength(1);
    expect(body.itemsNoMatcheados[0].motivo).toMatch(/SKU/i);
  });

  it('rechaza cantidad no positiva (400)', async () => {
    const operario = await loginAs(ctx, RolUsuario.OPERARIO);
    const almacen = await crearAlmacen(ctx.prisma);
    const inventarioRes = await agent(ctx.app)
      .post('/api/inventarios')
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ almacenId: almacen.id })
      .expect(201);
    const inventario = inventarioRes.body as InventarioBody;

    await agent(ctx.app)
      .post(`/api/inventarios/${inventario.id}/procesar-sku`)
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ sku: '123', cantidad: 0 })
      .expect(400);
  });
});
