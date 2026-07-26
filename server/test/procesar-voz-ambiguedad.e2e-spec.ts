import { RolUsuario } from '../src/generated/prisma/client';
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
  items: unknown[];
}

interface ProcesarVozBody {
  itemsMatcheados: Array<{ articulo: { nombre: string } }>;
  itemsNoMatcheados: Array<{ articuloBusqueda: string; motivo: string }>;
}

/**
 * Regresión end-to-end del hallazgo central de la auditoría real
 * (audit-voice-matching.ts): dictar un producto sin especificar la variante
 * (color/tamaño) que tiene dos gemelos en el catálogo NO debe registrar un
 * conteo silencioso contra ninguno de los dos — debe caer en
 * `itemsNoMatcheados` pidiendo precisión, y el inventario no debe ganar
 * ningún ítem nuevo.
 */
describe('POST /inventarios/:id/procesar-voz — ambigüedad real (e2e)', () => {
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

  it('un dictado ambiguo no registra ningún conteo y explica el motivo con ambos candidatos', async () => {
    const operario = await loginAs(ctx, RolUsuario.OPERARIO);
    const almacen = await crearAlmacen(ctx.prisma);

    await crearArticulo(ctx.prisma, {
      nombre: 'CEBOLLA CABEZONA ROJA',
      aliases: ['cebolla cabezona', 'cebolla roja'],
      categoria: 'Verduras',
    });
    await crearArticulo(ctx.prisma, {
      nombre: 'CEBOLLA CABEZONA BLANCA',
      aliases: ['cebolla cabezona', 'cebolla blanca'],
      categoria: 'Verduras',
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
      .send({ texto: 'una unidad de cebolla cabezona' })
      .expect(201);
    const body = procesarRes.body as ProcesarVozBody;

    expect(body.itemsMatcheados).toHaveLength(0);
    expect(body.itemsNoMatcheados).toHaveLength(1);
    expect(body.itemsNoMatcheados[0].motivo).toContain('CEBOLLA CABEZONA ROJA');
    expect(body.itemsNoMatcheados[0].motivo).toContain(
      'CEBOLLA CABEZONA BLANCA',
    );
    // Regresión de un bug real: el consejo antes era un genérico fijo
    // ("sé más específico: color, tamaño o cantidad exacta") que no
    // nombraba la palabra real que distingue a los candidatos — ahora debe
    // decir explícitamente cuál agregar para cada uno.
    expect(body.itemsNoMatcheados[0].motivo).toContain('agrega "roja"');
    expect(body.itemsNoMatcheados[0].motivo).toContain('agrega "blanca"');

    // Verificación de que de verdad no quedó nada registrado en el inventario.
    const detalleRes = await agent(ctx.app)
      .get(`/api/inventarios/${inventario.id}`)
      .set('Authorization', `Bearer ${operario.token}`)
      .expect(200);
    const detalle = detalleRes.body as InventarioBody;
    expect(detalle.items).toHaveLength(0);
  });

  it('dictar la variante específica sí registra el conteo contra el artículo correcto', async () => {
    const operario = await loginAs(ctx, RolUsuario.OPERARIO);
    const almacen = await crearAlmacen(ctx.prisma);

    await crearArticulo(ctx.prisma, {
      nombre: 'CEBOLLA CABEZONA ROJA',
      aliases: ['cebolla cabezona', 'cebolla roja'],
      categoria: 'Verduras',
    });
    await crearArticulo(ctx.prisma, {
      nombre: 'CEBOLLA CABEZONA BLANCA',
      aliases: ['cebolla cabezona', 'cebolla blanca'],
      categoria: 'Verduras',
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
      .send({ texto: 'una unidad de cebolla roja' })
      .expect(201);
    const body = procesarRes.body as ProcesarVozBody;

    expect(body.itemsNoMatcheados).toHaveLength(0);
    expect(body.itemsMatcheados).toHaveLength(1);
    expect(body.itemsMatcheados[0].articulo.nombre).toBe(
      'CEBOLLA CABEZONA ROJA',
    );
  });
});
