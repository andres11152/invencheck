import { UnidadMedida } from '../src/generated/prisma/client';
import {
  closeTestApp,
  createTestApp,
  type TestAppContext,
} from './utils/test-app';
import { truncateAll } from './utils/db-reset';
import { crearAlmacen, crearArticulo } from './utils/seed-fixtures';
import { loginAs } from './utils/auth';
import { agent } from './utils/http';

const N_REQUESTS = 20;
const DELTA_POR_REQUEST = 5;
const DELTA_EN_PALABRAS = 'cinco'; // debe corresponder a DELTA_POR_REQUEST

interface InventarioBody {
  id: string;
}

interface InventarioDetalleBody {
  items: Array<{ conteoFisico: number }>;
}

/**
 * `InventarioRepository.incrementarConteo` usa un `upsert` con
 * `increment` atómico en Postgres precisamente para que dictados casi
 * simultáneos del mismo artículo no se pisen entre sí (lost update). Solo
 * disparando peticiones HTTP realmente concurrentes contra Postgres real se
 * puede comprobar que la suma final es exacta.
 */
describe('Conteo concurrente (e2e)', () => {
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

  it(`suma ${N_REQUESTS} dictados concurrentes de ${DELTA_POR_REQUEST}kg sin perder ninguno`, async () => {
    const { token } = await loginAs(ctx);
    const almacen = await crearAlmacen(ctx.prisma);
    await crearArticulo(ctx.prisma, {
      nombre: 'PAPA CRIOLLA',
      aliases: ['papa criolla'],
      categoria: 'Verduras',
      unidadEstd: UnidadMedida.KILOGRAMO,
    });

    const crearRes = await agent(ctx.app)
      .post('/api/inventarios')
      .set('Authorization', `Bearer ${token}`)
      .send({ almacenId: almacen.id })
      .expect(201);
    const inventario = crearRes.body as InventarioBody;

    await Promise.all(
      Array.from({ length: N_REQUESTS }, () =>
        agent(ctx.app)
          .post(`/api/inventarios/${inventario.id}/procesar-voz`)
          .set('Authorization', `Bearer ${token}`)
          .send({ texto: `${DELTA_EN_PALABRAS} kilos de papa criolla` })
          .expect(201),
      ),
    );

    const detalleRes = await agent(ctx.app)
      .get(`/api/inventarios/${inventario.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const detalle = detalleRes.body as InventarioDetalleBody;

    expect(detalle.items).toHaveLength(1);
    expect(detalle.items[0].conteoFisico).toBeCloseTo(
      N_REQUESTS * DELTA_POR_REQUEST,
      2,
    );
  });
});
