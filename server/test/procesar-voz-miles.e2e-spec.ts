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

interface ProcesarVozBody {
  itemsMatcheados: Array<{ conteoFisico: number; unidadUsada: string }>;
  itemsNoMatcheados: unknown[];
}

/**
 * Regresión end-to-end de un bug real: dictar/escribir "15.000kg de papa
 * criolla" (convención colombiana de miles, a veces sin espacio antes de la
 * unidad) se registraba mal — 15.000 se leía como 15 (decimal) y "kg" no se
 * reconocía como unidad, o directamente no se registraba nada en absoluto
 * (`GEMINI_API_KEY` vacío en `.env.test`, así que este e2e corre contra el
 * parser local de verdad, no Gemini).
 */
describe('POST /inventarios/:id/procesar-voz — números con separador de miles (e2e)', () => {
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

  it.each([
    ['15.000kg de papa criolla', 15000],
    ['15.000 kg de papa criolla', 15000],
  ])(
    '"%s" registra %d kg, no cae en itemsNoMatcheados',
    async (texto, cantidadEsperada) => {
      const operario = await loginAs(ctx, RolUsuario.OPERARIO);
      const almacen = await crearAlmacen(ctx.prisma);
      await crearArticulo(ctx.prisma, {
        nombre: 'PAPA CRIOLLA',
        aliases: ['papa criolla'],
        categoria: 'Verduras',
        unidadEstd: UnidadMedida.KILOGRAMO,
      });

      const inventarioRes = await agent(ctx.app)
        .post('/api/inventarios')
        .set('Authorization', `Bearer ${operario.token}`)
        .send({ almacenId: almacen.id })
        .expect(201);
      const inventario = inventarioRes.body as InventarioBody;

      const procesarRes = await agent(ctx.app)
        .post(`/api/inventarios/${inventario.id}/procesar-voz`)
        .set('Authorization', `Bearer ${operario.token}`)
        .send({ texto })
        .expect(201);
      const body = procesarRes.body as ProcesarVozBody;

      expect(body.itemsNoMatcheados).toHaveLength(0);
      expect(body.itemsMatcheados).toHaveLength(1);
      expect(body.itemsMatcheados[0].conteoFisico).toBe(cantidadEsperada);
      expect(body.itemsMatcheados[0].unidadUsada).toBe(UnidadMedida.KILOGRAMO);
    },
  );
});
