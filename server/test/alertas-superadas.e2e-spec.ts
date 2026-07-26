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

interface InventarioDetalleBody {
  items: Array<{
    id: string;
    articulo: { nombre: string };
    conteoFisico: number;
    esAnomalia: boolean;
  }>;
  alertas: Array<{ id: string; tipo: string; mensaje: string }>;
}

/**
 * Regresión de un bug real reportado en producción: una alerta de
 * ANOMALIA_CANTIDAD se crea con el conteo que había en el momento del
 * dictado (ej. "20 kg se desvía -94%"). Si después llegan más dictados
 * válidos del mismo artículo y el TOTAL acumulado ya no se desvía,
 * `esAnomalia` se corrige a `false` — pero antes de este fix la alerta
 * vieja seguía activa PARA SIEMPRE, sin ninguna forma de resolverla desde
 * la UI (la tarjeta del ítem solo abre el modal si `esAnomalia` es
 * `true`, que ya no lo era) — un callejón sin salida que bloqueaba la
 * consolidación indefinidamente.
 */
describe('Alertas superadas por una re-evaluación posterior se auto-resuelven (e2e)', () => {
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

  it('un ANOMALIA_CANTIDAD creado con un conteo bajo se auto-resuelve cuando el total acumulado deja de ser anómalo', async () => {
    const operario = await loginAs(ctx, RolUsuario.OPERARIO);
    const almacen = await crearAlmacen(ctx.prisma);
    await crearArticulo(ctx.prisma, {
      nombre: 'PLATANO ARTON',
      aliases: ['platano arton'],
      categoria: 'Verduras',
      unidadEstd: UnidadMedida.KILOGRAMO,
      stockHistoricoAvg: 319.91,
    });

    const inventarioRes = await agent(ctx.app)
      .post('/api/inventarios')
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ almacenId: almacen.id })
      .expect(201);
    const inventario = inventarioRes.body as InventarioBody;

    // 20 kg vs. histórico 319.91 -> -94%, muy por debajo del -80% permitido.
    await agent(ctx.app)
      .post(`/api/inventarios/${inventario.id}/procesar-voz`)
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ texto: '20 kg de platano arton' })
      .expect(201);

    const conAnomalia = await agent(ctx.app)
      .get(`/api/inventarios/${inventario.id}`)
      .set('Authorization', `Bearer ${operario.token}`)
      .expect(200);
    const detalleConAnomalia = conAnomalia.body as InventarioDetalleBody;
    expect(detalleConAnomalia.items[0].esAnomalia).toBe(true);
    expect(detalleConAnomalia.alertas).toHaveLength(1);
    const alertaViejaId = detalleConAnomalia.alertas[0].id;

    // Dos dictados más, llevando el total a 220 kg -> -31% vs. 319.91,
    // dentro del rango normal (-80% a +200%).
    await agent(ctx.app)
      .post(`/api/inventarios/${inventario.id}/procesar-voz`)
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ texto: '100 kg de platano arton' })
      .expect(201);
    await agent(ctx.app)
      .post(`/api/inventarios/${inventario.id}/procesar-voz`)
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ texto: '100 kg de platano arton' })
      .expect(201);

    const detalleFinalRes = await agent(ctx.app)
      .get(`/api/inventarios/${inventario.id}`)
      .set('Authorization', `Bearer ${operario.token}`)
      .expect(200);
    const detalleFinal = detalleFinalRes.body as InventarioDetalleBody;

    expect(detalleFinal.items[0].conteoFisico).toBe(220);
    expect(detalleFinal.items[0].esAnomalia).toBe(false);
    // La alerta vieja ya no debe seguir "activa" (el include del server
    // solo trae alertas sin resolver Y sin revisar) — al no aparecer más
    // acá, queda confirmado que se auto-cerró.
    expect(
      detalleFinal.alertas.find((a) => a.id === alertaViejaId),
    ).toBeUndefined();
    expect(detalleFinal.alertas).toHaveLength(0);

    // Y por lo tanto el inventario si puede consolidarse ahora — sin haber
    // hecho ningún resolver/revisar manual sobre esa alerta vieja.
    const auditor = await loginAs(ctx, RolUsuario.AUDITOR);
    await agent(ctx.app)
      .patch(`/api/inventarios/${inventario.id}/estado`)
      .set('Authorization', `Bearer ${auditor.token}`)
      .send({ estado: 'CONCILIADO' })
      .expect(200);
  });

  it('si la anomalía sigue vigente, la alerta original permanece activa (no se auto-resuelve algo que sigue siendo cierto)', async () => {
    const operario = await loginAs(ctx, RolUsuario.OPERARIO);
    const almacen = await crearAlmacen(ctx.prisma);
    await crearArticulo(ctx.prisma, {
      nombre: 'MAZORCA',
      aliases: ['mazorca'],
      categoria: 'Verduras',
      unidadEstd: UnidadMedida.KILOGRAMO,
      stockHistoricoAvg: 139.41,
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
      .send({ texto: '20 kg de mazorca' })
      .expect(201);
    // Un segundo dictado pequeño: el total sigue muy desviado.
    await agent(ctx.app)
      .post(`/api/inventarios/${inventario.id}/procesar-voz`)
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ texto: '5 kg de mazorca' })
      .expect(201);

    const detalleRes = await agent(ctx.app)
      .get(`/api/inventarios/${inventario.id}`)
      .set('Authorization', `Bearer ${operario.token}`)
      .expect(200);
    const detalle = detalleRes.body as InventarioDetalleBody;

    expect(detalle.items[0].conteoFisico).toBe(25);
    expect(detalle.items[0].esAnomalia).toBe(true);
    expect(detalle.alertas).toHaveLength(1);
  });
});
