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

interface ItemInventarioBody {
  conteoFisico: number;
}

interface InventarioDetalleBody {
  items: ItemInventarioBody[];
  alertas: Array<{ tipo: string }>;
}

/**
 * Regresión de un bug real reportado (con capturas de producción):
 * "Re-dictar / Corregir" en el modal de anomalía dejaba el conteo
 * ACUMULADO en vez de reemplazado — cada intento de corregir un dictado
 * erróneo sumaba otra vez la cantidad, en vez de deshacer la anterior.
 * `PATCH .../articulos/:articuloId/deshacer-conteo` es lo que el cliente
 * llama antes de dejar redication, para restar exactamente el delta que
 * causó la anomalía pendiente.
 */
describe('PATCH /inventarios/:id/articulos/:articuloId/deshacer-conteo (e2e)', () => {
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

  it('resta exactamente el delta dictado, sin dejarlo acumulado', async () => {
    const operario = await loginAs(ctx, RolUsuario.OPERARIO);
    const almacen = await crearAlmacen(ctx.prisma);
    const articulo = await crearArticulo(ctx.prisma, {
      nombre: 'ARROZ DOÑA PEPA',
      aliases: ['arroz dona pepa'],
      categoria: 'AYB',
      unidadEstd: UnidadMedida.KILOGRAMO,
      stockHistoricoAvg: 5,
    });

    const inventarioRes = await agent(ctx.app)
      .post('/api/inventarios')
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ almacenId: almacen.id })
      .expect(201);
    const inventario = inventarioRes.body as InventarioBody;

    // Dictado erróneo: 20 kg (dispara ANOMALIA_CANTIDAD, 300% sobre el histórico de 5).
    await agent(ctx.app)
      .post(`/api/inventarios/${inventario.id}/procesar-voz`)
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ texto: '20 kilos de arroz dona pepa' })
      .expect(201);

    // "Re-dictar / Corregir": deshace los 20kg antes de que el operario
    // vuelva a hablar.
    await agent(ctx.app)
      .patch(
        `/api/inventarios/${inventario.id}/articulos/${articulo.id}/deshacer-conteo`,
      )
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ cantidadDictada: 20, unidadDictada: UnidadMedida.KILOGRAMO })
      .expect(200);

    const trasDeshacer = (
      await agent(ctx.app)
        .get(`/api/inventarios/${inventario.id}`)
        .set('Authorization', `Bearer ${operario.token}`)
        .expect(200)
    ).body as InventarioDetalleBody;
    expect(trasDeshacer.items[0].conteoFisico).toBe(0);
    // 0kg vs. histórico de 5 ya no dispara la desviación del 300% original,
    // pero SÍ sigue siendo -100% de desviación — se re-evalúa, no se ignora.
    expect(trasDeshacer.alertas.map((a) => a.tipo)).toContain(
      'ANOMALIA_CANTIDAD',
    );

    // La cantidad CORRECTA que el operario quería decir en realidad.
    await agent(ctx.app)
      .post(`/api/inventarios/${inventario.id}/procesar-voz`)
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ texto: '4 kilos de arroz dona pepa' })
      .expect(201);

    const final = (
      await agent(ctx.app)
        .get(`/api/inventarios/${inventario.id}`)
        .set('Authorization', `Bearer ${operario.token}`)
        .expect(200)
    ).body as InventarioDetalleBody;

    // Antes del fix: 20 (nunca deshecho) + 4 = 24kg. Con el fix: solo 4kg.
    expect(final.items[0].conteoFisico).toBe(4);
    // 4kg vs. histórico de 5 ya no es una desviación anómala — sin alertas.
    expect(final.alertas).toHaveLength(0);
  });

  it('deshacer una unidad ambigua (que nunca sumó nada a conteoFisico) no rompe nada y re-evalúa el estado actual', async () => {
    const operario = await loginAs(ctx, RolUsuario.OPERARIO);
    const almacen = await crearAlmacen(ctx.prisma);
    const articulo = await crearArticulo(ctx.prisma, {
      nombre: 'PAPA CRIOLLA',
      aliases: ['papa criolla'],
      categoria: 'AYB',
      unidadEstd: UnidadMedida.KILOGRAMO,
    });

    const inventarioRes = await agent(ctx.app)
      .post('/api/inventarios')
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ almacenId: almacen.id })
      .expect(201);
    const inventario = inventarioRes.body as InventarioBody;

    // Unidad no convertible: dispara UNIDAD_AMBIGUA, conteoFisico queda en 0.
    await agent(ctx.app)
      .post(`/api/inventarios/${inventario.id}/procesar-voz`)
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ texto: 'un litro de papa criolla' })
      .expect(201);

    await agent(ctx.app)
      .patch(
        `/api/inventarios/${inventario.id}/articulos/${articulo.id}/deshacer-conteo`,
      )
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ cantidadDictada: 1, unidadDictada: UnidadMedida.LITRO })
      .expect(200);

    const detalle = (
      await agent(ctx.app)
        .get(`/api/inventarios/${inventario.id}`)
        .set('Authorization', `Bearer ${operario.token}`)
        .expect(200)
    ).body as InventarioDetalleBody;
    expect(detalle.items[0].conteoFisico).toBe(0);
  });

  it('404 si el artículo nunca se contó en este inventario', async () => {
    const operario = await loginAs(ctx, RolUsuario.OPERARIO);
    const almacen = await crearAlmacen(ctx.prisma);
    const articulo = await crearArticulo(ctx.prisma, {
      nombre: 'SAL',
      categoria: 'AYB',
    });

    const inventarioRes = await agent(ctx.app)
      .post('/api/inventarios')
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ almacenId: almacen.id })
      .expect(201);
    const inventario = inventarioRes.body as InventarioBody;

    await agent(ctx.app)
      .patch(
        `/api/inventarios/${inventario.id}/articulos/${articulo.id}/deshacer-conteo`,
      )
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ cantidadDictada: 1, unidadDictada: UnidadMedida.UNIDAD })
      .expect(404);
  });
});
