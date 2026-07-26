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
  alertas: Array<{ id: string; tipo: string; mensaje: string }>;
}

/**
 * Regresión de un bug real reportado: dictar el mismo ítem dos veces
 * mientras sigue en el mismo estado problemático (misma unidad ambigua sin
 * resolver, o sigue desviado del histórico) creaba una alerta NUEVA en cada
 * dictado — el operario veía la misma anomalía duplicada N veces en el
 * modal, aunque fuera el mismo problema sin cambiar.
 */
describe('Deduplicación de alertas activas (e2e)', () => {
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

  it('dictar el mismo ítem dos veces con unidad ambigua no duplica la alerta', async () => {
    const operario = await loginAs(ctx, RolUsuario.OPERARIO);
    const almacen = await crearAlmacen(ctx.prisma);
    await crearArticulo(ctx.prisma, {
      nombre: 'PAPA CRIOLLA',
      aliases: ['papa criolla'],
      categoria: 'Verduras',
      unidadEstd: UnidadMedida.KILOGRAMO, // no convertible desde UNIDAD
    });

    const inventarioRes = await agent(ctx.app)
      .post('/api/inventarios')
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ almacenId: almacen.id })
      .expect(201);
    const inventario = inventarioRes.body as InventarioBody;

    // Dictar sin unidad explícita cae a UNIDAD por defecto — ambigua contra
    // un artículo que se maneja en KILOGRAMO, sin conversión automática.
    await agent(ctx.app)
      .post(`/api/inventarios/${inventario.id}/procesar-voz`)
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ texto: 'una papa criolla' })
      .expect(201);

    // Mismo ítem, mismo problema sin resolver todavía — se dicta otra vez.
    await agent(ctx.app)
      .post(`/api/inventarios/${inventario.id}/procesar-voz`)
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ texto: 'una papa criolla' })
      .expect(201);

    const detalleRes = await agent(ctx.app)
      .get(`/api/inventarios/${inventario.id}`)
      .set('Authorization', `Bearer ${operario.token}`)
      .expect(200);
    const detalle = detalleRes.body as InventarioBody;

    expect(detalle.alertas).toHaveLength(1);
    expect(detalle.alertas[0].tipo).toBe('UNIDAD_AMBIGUA');
  });

  it('una vez resuelta Y revisada, un problema que reaparece SÍ genera una alerta nueva', async () => {
    const operario = await loginAs(ctx, RolUsuario.OPERARIO);
    const auditor = await loginAs(ctx, RolUsuario.AUDITOR);
    const almacen = await crearAlmacen(ctx.prisma);
    await crearArticulo(ctx.prisma, {
      nombre: 'ARROZ BLANCO',
      aliases: ['arroz blanco'],
      categoria: 'Abarrotes',
      unidadEstd: UnidadMedida.KILOGRAMO,
    });

    const inventarioRes = await agent(ctx.app)
      .post('/api/inventarios')
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ almacenId: almacen.id })
      .expect(201);
    const inventario = inventarioRes.body as InventarioBody;

    await agent(ctx.app)
      .post(`/api/inventarios/${inventario.id}/procesar-voz`)
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ texto: 'un arroz blanco' })
      .expect(201);

    const primeraRes = await agent(ctx.app)
      .get(`/api/inventarios/${inventario.id}`)
      .set('Authorization', `Bearer ${operario.token}`)
      .expect(200);
    const primeraAlertaId = (primeraRes.body as InventarioBody).alertas[0].id;

    // Se resuelve (auto-chequeo operario) Y se revisa (gate de auditoría) —
    // queda completamente cerrada.
    await agent(ctx.app)
      .patch(
        `/api/inventarios/${inventario.id}/alertas/${primeraAlertaId}/resolver`,
      )
      .set('Authorization', `Bearer ${operario.token}`)
      .expect(200);
    await agent(ctx.app)
      .patch(
        `/api/inventarios/${inventario.id}/alertas/${primeraAlertaId}/revisar`,
      )
      .set('Authorization', `Bearer ${auditor.token}`)
      .expect(200);

    // El mismo problema (unidad ambigua) vuelve a aparecer en un dictado
    // posterior — como la anterior ya está totalmente cerrada, esta debe
    // registrarse como una alerta nueva, no descartarse como duplicado.
    await agent(ctx.app)
      .post(`/api/inventarios/${inventario.id}/procesar-voz`)
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ texto: 'un arroz blanco' })
      .expect(201);

    const finalRes = await agent(ctx.app)
      .get(`/api/inventarios/${inventario.id}`)
      .set('Authorization', `Bearer ${operario.token}`)
      .expect(200);
    const finalDetalle = finalRes.body as InventarioBody;

    expect(finalDetalle.alertas).toHaveLength(1);
    expect(finalDetalle.alertas[0].id).not.toBe(primeraAlertaId);
  });
});
