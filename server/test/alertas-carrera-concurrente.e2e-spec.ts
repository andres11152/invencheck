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
  alertas: Array<{ id: string; tipo: string }>;
}

/**
 * Regresión de una condición de carrera real (encontrada en auditoría de
 * arquitectura, no reportada por un usuario): la deduplicación de alertas
 * de `InventarioRepository.crearAlertas` vivía como un check-then-act en
 * código de aplicación (leer activas -> filtrar -> insertar) — bajo
 * dictados GENUINAMENTE simultáneos del mismo ítem (dos operarios
 * contando la misma bodega al mismo tiempo, o reintentos de red desde el
 * mismo dispositivo), ambas lecturas podían pasar antes de que cualquiera
 * insertara, colando duplicados de todas formas. Un test secuencial
 * (dictar, esperar, dictar de nuevo) NO puede detectar esto — hace falta
 * concurrencia real con `Promise.all`.
 */
describe('Alertas bajo dictados concurrentes reales (e2e)', () => {
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

  it('10 dictados concurrentes del mismo ítem, mismo problema, generan UNA sola alerta activa', async () => {
    const operario = await loginAs(ctx, RolUsuario.OPERARIO);
    const almacen = await crearAlmacen(ctx.prisma);
    await crearArticulo(ctx.prisma, {
      nombre: 'PLATANO ARTON',
      aliases: ['platano arton'],
      categoria: 'Verduras',
      unidadEstd: UnidadMedida.KILOGRAMO, // no convertible desde UNIDAD -> UNIDAD_AMBIGUA garantizado
    });

    const inventarioRes = await agent(ctx.app)
      .post('/api/inventarios')
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ almacenId: almacen.id })
      .expect(201);
    const inventario = inventarioRes.body as InventarioBody;

    // Genuinamente concurrentes: los 10 requests salen antes de que
    // cualquiera termine, a diferencia de dictar-esperar-dictar en
    // secuencia (que ya cubre el test de deduplicación normal).
    await Promise.all(
      Array.from({ length: 10 }, () =>
        agent(ctx.app)
          .post(`/api/inventarios/${inventario.id}/procesar-voz`)
          .set('Authorization', `Bearer ${operario.token}`)
          .send({ texto: 'un platano arton' })
          .expect(201),
      ),
    );

    const detalleRes = await agent(ctx.app)
      .get(`/api/inventarios/${inventario.id}`)
      .set('Authorization', `Bearer ${operario.token}`)
      .expect(200);
    const detalle = detalleRes.body as InventarioDetalleBody;

    expect(detalle.alertas).toHaveLength(1);
    expect(detalle.alertas[0].tipo).toBe('UNIDAD_AMBIGUA');
  });
});
