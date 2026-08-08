import { RolUsuario, UnidadMedida } from '../src/generated/prisma/client';
import {
  closeTestApp,
  createTestApp,
  type TestAppContext,
} from './utils/test-app';
import { truncateAll } from './utils/db-reset';
import {
  crearAlmacen,
  crearArticulo,
  crearOrganizacion,
  crearUsuarioDemo,
} from './utils/seed-fixtures';
import { agent } from './utils/http';

interface LoginResponseBody {
  accessToken: string;
}

interface AlmacenBody {
  id: string;
  codigo: string;
}

interface ArticuloBody {
  id: string;
  nombre: string;
}

interface InventarioBody {
  id: string;
}

interface MatchVoiceBody {
  articulo: { id: string; nombre: string } | null;
}

/**
 * Prueba el mecanismo central del SaaS multi-tenant: dos organizaciones con
 * datos que COLISIONAN a propósito (mismo código de bodega, mismo SKU, mismo
 * nombre de artículo) deben quedar completamente aisladas entre sí — tanto
 * en listados como en lookups directos por id y en el matching por voz.
 *
 * Esto verifica la capa de APLICACIÓN (extensión de Prisma +
 * `AlcanceOrganizacionMiddleware` + JWT). El backstop de RLS en Postgres
 * (que estos mismos datos no se filtren ni puenteando la extensión) se
 * agrega en la Fase 3 del plan SaaS, cuando las policies se habilitan.
 *
 * orgA/orgB y sus tokens se crean UNA sola vez para todo el archivo (no por
 * test): `/auth/login` tiene un límite de 5 req/min por IP a propósito
 * (fuerza bruta de credenciales), y cada test aquí necesita loguear en dos
 * organizaciones — con 5+ tests ese límite se agota rápido. Los fixtures ya
 * generan sufijos aleatorios, así que reutilizar las mismas dos
 * organizaciones entre tests no genera colisiones de datos.
 */
describe('Aislamiento entre organizaciones (e2e)', () => {
  let ctx: TestAppContext;
  let orgAId: string;
  let orgBId: string;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    const orgA = await crearOrganizacion(ctx.prisma);
    const orgB = await crearOrganizacion(ctx.prisma);
    orgAId = orgA.id;
    orgBId = orgB.id;
    tokenA = await loginEnOrganizacion(orgAId, RolUsuario.OPERARIO);
    tokenB = await loginEnOrganizacion(orgBId, RolUsuario.OPERARIO);
  });

  afterAll(async () => {
    await truncateAll(ctx.prisma);
    await closeTestApp(ctx);
  });

  async function loginEnOrganizacion(organizacionId: string, rol: RolUsuario) {
    const { usuario, password } = await crearUsuarioDemo(ctx.prisma, rol, {
      organizacionId,
    });
    const res = await agent(ctx.app)
      .post('/api/auth/login')
      .send({ email: usuario.email, password })
      .expect(200);
    return (res.body as LoginResponseBody).accessToken;
  }

  it('las bodegas y artículos de una organización nunca aparecen en los listados de otra, aunque tengan el mismo código/SKU/nombre', async () => {
    // Mismo código de bodega y mismo SKU/nombre de artículo en ambas
    // organizaciones — a propósito, para que una fuga sea inconfundible.
    await crearAlmacen(ctx.prisma, {
      organizacionId: orgAId,
      codigo: 'BOD-COLISION',
      nombre: 'Bodega de A',
    });
    await crearAlmacen(ctx.prisma, {
      organizacionId: orgBId,
      codigo: 'BOD-COLISION',
      nombre: 'Bodega de B',
    });
    await crearArticulo(ctx.prisma, {
      organizacionId: orgAId,
      sku: 'SKU-COLISION',
      nombre: 'PRODUCTO COMPARTIDO',
    });
    await crearArticulo(ctx.prisma, {
      organizacionId: orgBId,
      sku: 'SKU-COLISION',
      nombre: 'PRODUCTO COMPARTIDO',
    });

    const almacenesRes = await agent(ctx.app)
      .get('/api/almacenes')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    const almacenes = (almacenesRes.body as AlmacenBody[]).filter(
      (a) => a.codigo === 'BOD-COLISION',
    );
    expect(almacenes).toHaveLength(1);

    const articulosRes = await agent(ctx.app)
      .get('/api/articulos')
      .query({ search: 'PRODUCTO COMPARTIDO' })
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    const articulos = (articulosRes.body as ArticuloBody[]).filter(
      (a) => a.nombre === 'PRODUCTO COMPARTIDO',
    );
    expect(articulos).toHaveLength(1);
  });

  it('un GET directo por id de un inventario de otra organización responde 404, no los datos', async () => {
    const almacenB = await crearAlmacen(ctx.prisma, { organizacionId: orgBId });

    const inventarioB = await agent(ctx.app)
      .post('/api/inventarios')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ almacenId: almacenB.id })
      .expect(201);
    const inventarioBId = (inventarioB.body as InventarioBody).id;

    // El propio dueño sí lo ve.
    await agent(ctx.app)
      .get(`/api/inventarios/${inventarioBId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    // Org A, con un token válido pero de otra organización, no.
    await agent(ctx.app)
      .get(`/api/inventarios/${inventarioBId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
  });

  it('crear un inventario contra el almacenId de otra organización responde 404 (no lo crea contra un almacén ajeno)', async () => {
    const almacenB = await crearAlmacen(ctx.prisma, { organizacionId: orgBId });

    await agent(ctx.app)
      .post('/api/inventarios')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ almacenId: almacenB.id })
      .expect(404);
  });

  it('procesar-articulo con el articuloId de otra organización responde 404 (no cuenta contra un catálogo ajeno)', async () => {
    const almacenA = await crearAlmacen(ctx.prisma, { organizacionId: orgAId });
    const articuloB = await crearArticulo(ctx.prisma, {
      organizacionId: orgBId,
      unidadEstd: UnidadMedida.KILOGRAMO,
    });

    const inventarioA = await agent(ctx.app)
      .post('/api/inventarios')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ almacenId: almacenA.id })
      .expect(201);
    const inventarioAId = (inventarioA.body as InventarioBody).id;

    await agent(ctx.app)
      .post(`/api/inventarios/${inventarioAId}/procesar-articulo`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ articuloId: articuloB.id, cantidad: 5 })
      .expect(404);
  });

  it('el matching por voz resuelve al artículo de LA PROPIA organización cuando el nombre colisiona con otra', async () => {
    const articuloA = await crearArticulo(ctx.prisma, {
      organizacionId: orgAId,
      nombre: 'PAPA CRIOLLA COLISION',
      aliases: ['papa criolla colision'],
      unidadEstd: UnidadMedida.KILOGRAMO,
    });
    await crearArticulo(ctx.prisma, {
      organizacionId: orgBId,
      nombre: 'PAPA CRIOLLA COLISION',
      aliases: ['papa criolla colision'],
      unidadEstd: UnidadMedida.KILOGRAMO,
    });

    const res = await agent(ctx.app)
      .post('/api/articulos/match-voice')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ query: 'papa criolla colision' })
      .expect(201);

    const match = res.body as MatchVoiceBody;
    expect(match.articulo?.id).toBe(articuloA.id);
  });
});
