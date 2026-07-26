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
  itemsNoMatcheados: Array<{
    motivo: string;
    candidatos?: Array<{ id: string; nombre: string }>;
  }>;
}

interface ProcesarResultBody {
  fuenteIA: string;
  itemsMatcheados: Array<{
    articulo: { id: string; nombre: string };
    conteoFisico: number;
    scoreMatch: number;
  }>;
  itemsNoMatcheados: unknown[];
}

/**
 * Regresión de un bug real reportado: cuando un candidato ambiguo es
 * prefijo exacto de otro ("PAPA CRIOLLA" / "PAPA CRIOLLA PRECOCIDA"), no
 * existe ninguna frase que se pueda DICTAR para elegir el candidato corto
 * sin reproducir la misma ambigüedad — re-dictar entraba en loop infinito.
 * Este endpoint permite elegir directamente por id, sin pasar por el
 * matching difuso de voz otra vez.
 */
describe('POST /inventarios/:id/procesar-articulo (e2e)', () => {
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

  it('rompe el loop: la ambigüedad expone candidatos con id, y elegir el que es prefijo exacto lo registra sin volver a preguntar', async () => {
    const operario = await loginAs(ctx, RolUsuario.OPERARIO);
    const almacen = await crearAlmacen(ctx.prisma);

    const cruda = await crearArticulo(ctx.prisma, {
      nombre: 'PAPA CRIOLLA',
      aliases: ['papa criolla'],
      categoria: 'Verduras',
      unidadEstd: UnidadMedida.KILOGRAMO,
    });
    await crearArticulo(ctx.prisma, {
      nombre: 'PAPA CRIOLLA PRECOCIDA',
      // Alias "papa criolla" compartido con la cruda a propósito: es
      // justo lo que hace que dictar esa frase sola sea genuinamente
      // ambiguo entre las dos (mismo patrón que
      // procesar-voz-ambiguedad.e2e-spec.ts).
      aliases: ['papa criolla', 'papa criolla precocida'],
      categoria: 'Verduras',
      unidadEstd: UnidadMedida.KILOGRAMO,
    });

    const inventarioRes = await agent(ctx.app)
      .post('/api/inventarios')
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ almacenId: almacen.id })
      .expect(201);
    const inventario = inventarioRes.body as InventarioBody;

    // Dictar "papa criolla" a secas es ambiguo (matchea top-1 y top-2 con
    // scores muy cercanos) — confirma que el server expone los candidatos
    // con su id, no solo el mensaje de texto.
    const procesarVozRes = await agent(ctx.app)
      .post(`/api/inventarios/${inventario.id}/procesar-voz`)
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ texto: '20 kilos de papa criolla' })
      .expect(201);
    const vozBody = procesarVozRes.body as ProcesarVozBody;

    expect(vozBody.itemsNoMatcheados).toHaveLength(1);
    const candidatos = vozBody.itemsNoMatcheados[0].candidatos;
    expect(candidatos).toBeDefined();
    expect(candidatos!.map((c) => c.nombre).sort()).toEqual([
      'PAPA CRIOLLA',
      'PAPA CRIOLLA PRECOCIDA',
    ]);

    // Re-dictar la misma frase (sin agregar la palabra distintiva)
    // reproduce la MISMA ambigüedad — es exactamente el loop reportado, se
    // documenta acá para que quede explícito que la única salida real es
    // elegir por id. (El parser local de voz -sin Gemini, como corre este
    // e2e- necesita una cantidad para reconocer un ítem, por eso se repite
    // "20 kilos de" también, no solo "papa criolla".)
    const reDictadoRes = await agent(ctx.app)
      .post(`/api/inventarios/${inventario.id}/procesar-voz`)
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ texto: '20 kilos de papa criolla' })
      .expect(201);
    expect(
      (reDictadoRes.body as ProcesarVozBody).itemsNoMatcheados,
    ).toHaveLength(1);

    // Elegir directamente el candidato corto (prefijo exacto del otro) por
    // id sí lo resuelve, sin ambigüedad. El cliente real siempre manda la
    // unidad originalmente dictada (ver handleElegirCandidato en
    // page.tsx) — sin especificarla, el server no puede asumir que 20 ya
    // está en la unidad estándar del artículo (KILOGRAMO) y lo trataría
    // como una unidad ambigua nueva, no como el conteo esperado.
    const idCorto = candidatos!.find((c) => c.nombre === 'PAPA CRIOLLA')!.id;
    const seleccionRes = await agent(ctx.app)
      .post(`/api/inventarios/${inventario.id}/procesar-articulo`)
      .set('Authorization', `Bearer ${operario.token}`)
      .send({
        articuloId: idCorto,
        cantidad: 20,
        unidadDictada: UnidadMedida.KILOGRAMO,
      })
      .expect(201);
    const seleccionBody = seleccionRes.body as ProcesarResultBody;

    expect(seleccionBody.fuenteIA).toBe('SELECCION_MANUAL');
    expect(seleccionBody.itemsMatcheados).toHaveLength(1);
    expect(seleccionBody.itemsMatcheados[0].articulo.id).toBe(cruda.id);
    expect(seleccionBody.itemsMatcheados[0].conteoFisico).toBe(20);
    expect(seleccionBody.itemsMatcheados[0].scoreMatch).toBe(1);
    expect(seleccionBody.itemsNoMatcheados).toHaveLength(0);
  });

  it('un articuloId que no existe en el catálogo devuelve 404', async () => {
    const operario = await loginAs(ctx, RolUsuario.OPERARIO);
    const almacen = await crearAlmacen(ctx.prisma);
    const inventarioRes = await agent(ctx.app)
      .post('/api/inventarios')
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ almacenId: almacen.id })
      .expect(201);
    const inventario = inventarioRes.body as InventarioBody;

    await agent(ctx.app)
      .post(`/api/inventarios/${inventario.id}/procesar-articulo`)
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ articuloId: 'no-existe', cantidad: 5 })
      .expect(404);
  });

  it('rechaza cantidad no positiva (400)', async () => {
    const operario = await loginAs(ctx, RolUsuario.OPERARIO);
    const almacen = await crearAlmacen(ctx.prisma);
    const articulo = await crearArticulo(ctx.prisma, {
      nombre: 'ARROZ BLANCO EXCELSO',
      categoria: 'Abarrotes',
    });
    const inventarioRes = await agent(ctx.app)
      .post('/api/inventarios')
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ almacenId: almacen.id })
      .expect(201);
    const inventario = inventarioRes.body as InventarioBody;

    await agent(ctx.app)
      .post(`/api/inventarios/${inventario.id}/procesar-articulo`)
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ articuloId: articulo.id, cantidad: 0 })
      .expect(400);
  });
});
