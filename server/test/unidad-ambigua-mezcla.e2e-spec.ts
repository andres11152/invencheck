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
    articulo: { nombre: string };
    conteoFisico: number;
    unidadUsada: string;
  }>;
}

/**
 * Regresión de un bug real y serio reportado en producción: un ítem que
 * primero cae en "unidad ambigua" (ej. se dictó sin unidad, cae a UNIDAD
 * por defecto, contra un artículo que se maneja en KILOGRAMO) y LUEGO se
 * dicta correctamente en kg terminaba con un total sin sentido — el valor
 * sembrado por el camino ambiguo (en UNIDAD) se sumaba a ciegas con los
 * deltas en KILOGRAMO de los dictados válidos posteriores, como si fueran
 * la misma escala. Ejemplo real: "1 unidad" ambigua + "20 kg" + "20 kg" ->
 * mostraba 41 kg en vez de 40.
 */
describe('Unidad ambigua no contamina el conteo con dictados válidos posteriores (e2e)', () => {
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

  it('unidad ambigua (sembrada en UNIDAD) seguida de dos dictados válidos en KILOGRAMO no mezcla las escalas', async () => {
    const operario = await loginAs(ctx, RolUsuario.OPERARIO);
    const almacen = await crearAlmacen(ctx.prisma);
    await crearArticulo(ctx.prisma, {
      nombre: 'PLATANO ARTON',
      aliases: ['platano arton'],
      categoria: 'Verduras',
      unidadEstd: UnidadMedida.KILOGRAMO,
    });

    const inventarioRes = await agent(ctx.app)
      .post('/api/inventarios')
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ almacenId: almacen.id })
      .expect(201);
    const inventario = inventarioRes.body as InventarioBody;

    // 1) Dictado sin unidad explícita -> cae a UNIDAD por defecto, ambiguo
    //    contra un artículo en KILOGRAMO. Antes del fix, esto sembraba
    //    conteoFisico=1 en la unidad UNIDAD.
    await agent(ctx.app)
      .post(`/api/inventarios/${inventario.id}/procesar-voz`)
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ texto: 'un platano arton' })
      .expect(201);

    // 2) y 3) Dos dictados válidos en KILOGRAMO, 20 kg cada uno.
    await agent(ctx.app)
      .post(`/api/inventarios/${inventario.id}/procesar-voz`)
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ texto: '20 kg de platano arton' })
      .expect(201);
    await agent(ctx.app)
      .post(`/api/inventarios/${inventario.id}/procesar-voz`)
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ texto: '20 kg de platano arton' })
      .expect(201);

    const detalleRes = await agent(ctx.app)
      .get(`/api/inventarios/${inventario.id}`)
      .set('Authorization', `Bearer ${operario.token}`)
      .expect(200);
    const detalle = detalleRes.body as InventarioDetalleBody;

    expect(detalle.items).toHaveLength(1);
    // 40, no 41: el "1" sembrado en UNIDAD por el camino ambiguo NUNCA debe
    // sumarse a los kilogramos dictados después.
    expect(detalle.items[0].conteoFisico).toBe(40);
    expect(detalle.items[0].unidadUsada).toBe('KILOGRAMO');
  });
});
