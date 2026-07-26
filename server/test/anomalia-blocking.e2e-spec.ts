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
  estado: string;
}

interface ProcesarVozBody {
  itemsMatcheados: Array<{ esAnomalia: boolean }>;
}

interface InventarioDetalleBody {
  alertas: Array<{ id: string }>;
}

/**
 * El flujo de negocio central de la app (ver CLAUDE.md): una anomalía sin
 * resolver debe bloquear la consolidación del inventario, verificado del
 * lado del servidor — no solo deshabilitado en el cliente.
 *
 * Desde el hallazgo de que un OPERARIO podía auto-resolver su propia
 * anomalía (confirmado empíricamente contra el server real: PATCH .../resolver
 * sin @Roles devolvía 200 con el token del propio operario), el bloqueo es
 * de DOS pasos: `resolver` (auto-chequeo del operario, cualquier usuario) +
 * `revisar` (gate real, solo AUDITOR/ADMIN). Ninguno de los dos por
 * separado desbloquea `cambiarEstado` — hacen falta ambos.
 */
describe('Bloqueo de consolidación por anomalía (e2e)', () => {
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

  async function crearInventarioConAnomalia() {
    const operario = await loginAs(ctx, RolUsuario.OPERARIO);
    const auditor = await loginAs(ctx, RolUsuario.AUDITOR);

    const almacen = await crearAlmacen(ctx.prisma);
    await crearArticulo(ctx.prisma, {
      nombre: 'PAPA CRIOLLA',
      aliases: ['papa criolla'],
      categoria: 'Verduras',
      unidadEstd: UnidadMedida.KILOGRAMO,
      // Promedio histórico bajo para que un conteo grande dispare ANOMALIA_CANTIDAD.
      stockHistoricoAvg: 10,
    });

    const crearRes = await agent(ctx.app)
      .post('/api/inventarios')
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ almacenId: almacen.id })
      .expect(201);
    const inventario = crearRes.body as InventarioBody;

    // 100kg vs. promedio histórico de 10kg → +900%, muy por encima de +200%.
    const procesarRes = await agent(ctx.app)
      .post(`/api/inventarios/${inventario.id}/procesar-voz`)
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ texto: 'cien kilos de papa criolla' })
      .expect(201);
    const procesado = procesarRes.body as ProcesarVozBody;

    expect(procesado.itemsMatcheados).toHaveLength(1);
    expect(procesado.itemsMatcheados[0].esAnomalia).toBe(true);

    const detalleRes = await agent(ctx.app)
      .get(`/api/inventarios/${inventario.id}`)
      .set('Authorization', `Bearer ${auditor.token}`)
      .expect(200);
    const detalleConAlerta = detalleRes.body as InventarioDetalleBody;
    expect(detalleConAlerta.alertas.length).toBeGreaterThan(0);

    return {
      operario,
      auditor,
      inventarioId: inventario.id,
      alertaId: detalleConAlerta.alertas[0].id,
    };
  }

  it('bloqueado sin resolver; resolver+revisar (ambos) desbloquea la transición', async () => {
    const { auditor, inventarioId, alertaId } =
      await crearInventarioConAnomalia();

    // Bloqueado: la anomalía sigue sin resolver ni revisar.
    await agent(ctx.app)
      .patch(`/api/inventarios/${inventarioId}/estado`)
      .set('Authorization', `Bearer ${auditor.token}`)
      .send({ estado: 'CONCILIADO' })
      .expect(400);

    await agent(ctx.app)
      .patch(`/api/inventarios/${inventarioId}/alertas/${alertaId}/resolver`)
      .set('Authorization', `Bearer ${auditor.token}`)
      .expect(200);

    // Todavía bloqueado: falta la revisión de auditoría.
    await agent(ctx.app)
      .patch(`/api/inventarios/${inventarioId}/estado`)
      .set('Authorization', `Bearer ${auditor.token}`)
      .send({ estado: 'CONCILIADO' })
      .expect(400);

    await agent(ctx.app)
      .patch(`/api/inventarios/${inventarioId}/alertas/${alertaId}/revisar`)
      .set('Authorization', `Bearer ${auditor.token}`)
      .expect(200);

    // Desbloqueado: ya no quedan alertas activas.
    const consolidarRes = await agent(ctx.app)
      .patch(`/api/inventarios/${inventarioId}/estado`)
      .set('Authorization', `Bearer ${auditor.token}`)
      .send({ estado: 'CONCILIADO' })
      .expect(200);
    const consolidado = consolidarRes.body as InventarioBody;

    expect(consolidado.estado).toBe('CONCILIADO');
  });

  it('un OPERARIO puede auto-confirmar (resolver) pero NO puede revisar su propia anomalía (403)', async () => {
    const { operario, inventarioId, alertaId } =
      await crearInventarioConAnomalia();

    // El auto-chequeo del operario sigue permitido (no requiere rol).
    await agent(ctx.app)
      .patch(`/api/inventarios/${inventarioId}/alertas/${alertaId}/resolver`)
      .set('Authorization', `Bearer ${operario.token}`)
      .expect(200);

    // Pero el gate real de auditoría está vedado para el propio operario:
    // regresión directa del hallazgo de auto-resolución sin control.
    await agent(ctx.app)
      .patch(`/api/inventarios/${inventarioId}/alertas/${alertaId}/revisar`)
      .set('Authorization', `Bearer ${operario.token}`)
      .expect(403);

    // Y por lo tanto tampoco puede consolidar por su cuenta.
    await agent(ctx.app)
      .patch(`/api/inventarios/${inventarioId}/estado`)
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ estado: 'CONCILIADO' })
      .expect(403);
  });
});
