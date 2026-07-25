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

interface VariacionRow {
  articuloId: string;
  tomas: number;
  anomalias: number;
  promedioTeorico: number;
  promedioContado: number;
  mermaTotal: number;
}

describe('GET /reportes/variacion (e2e)', () => {
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

  it('agrega teórico/contado/merma por artículo a partir de tomas reales', async () => {
    const { token } = await loginAs(ctx, RolUsuario.AUDITOR);
    const almacen = await crearAlmacen(ctx.prisma);
    const articulo = await crearArticulo(ctx.prisma, {
      nombre: 'PECHUGA DE POLLO',
      unidadEstd: UnidadMedida.KILOGRAMO,
    });

    // Dos tomas físicas independientes del mismo artículo en la misma bodega,
    // con valores conocidos de antemano para poder calcular el agregado esperado a mano.
    for (const [teorico, conteoFisico, esAnomalia] of [
      [10, 12, false],
      [10, 50, true],
    ] as const) {
      const inventario = await ctx.prisma.inventario.create({
        data: {
          almacenId: almacen.id,
          usuarioId: 'test-usuario',
          fechaCorte: new Date(),
        },
      });
      await ctx.prisma.itemInventario.create({
        data: {
          inventarioId: inventario.id,
          articuloId: articulo.id,
          teorico,
          conteoFisico,
          unidadUsada: UnidadMedida.KILOGRAMO,
          esAnomalia,
        },
      });
    }

    const res = await agent(ctx.app)
      .get('/api/reportes/variacion')
      .query({ almacenId: almacen.id })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const filas = res.body as VariacionRow[];

    const fila = filas.find((f) => f.articuloId === articulo.id);
    expect(fila).toBeDefined();
    expect(fila!.tomas).toBe(2);
    expect(fila!.anomalias).toBe(1);
    expect(Number(fila!.promedioTeorico)).toBeCloseTo(10, 2);
    expect(Number(fila!.promedioContado)).toBeCloseTo(31, 2);
    expect(Number(fila!.mermaTotal)).toBeCloseTo(42, 2);
  });

  it('devuelve 404 si el almacenId filtrado no existe', async () => {
    const { token } = await loginAs(ctx, RolUsuario.AUDITOR);

    await agent(ctx.app)
      .get('/api/reportes/variacion')
      .query({ almacenId: 'no-existe' })
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
