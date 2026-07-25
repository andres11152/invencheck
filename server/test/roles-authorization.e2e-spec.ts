import { RolUsuario } from '../src/generated/prisma/client';
import {
  closeTestApp,
  createTestApp,
  type TestAppContext,
} from './utils/test-app';
import { truncateAll } from './utils/db-reset';
import { crearAlmacen } from './utils/seed-fixtures';
import { loginAs, type LoggedInUser } from './utils/auth';
import { agent } from './utils/http';

interface InventarioBody {
  id: string;
}

/**
 * Segregación de funciones: quien contó (OPERARIO) no se autoaprueba.
 * `RolesGuard` es global — se verifica a nivel HTTP, no solo en el cliente.
 *
 * Los 3 usuarios se loguean UNA sola vez en `beforeAll` (no por test): el
 * login tiene un `@Throttle` estricto (5/60s por IP) y todos los requests de
 * supertest salen de la misma IP — loguear en cada `it` agotaría el límite.
 */
describe('Autorización por rol (e2e)', () => {
  let ctx: TestAppContext;
  let operario: LoggedInUser;
  let auditor: LoggedInUser;
  let admin: LoggedInUser;

  beforeAll(async () => {
    ctx = await createTestApp();
    operario = await loginAs(ctx, RolUsuario.OPERARIO);
    auditor = await loginAs(ctx, RolUsuario.AUDITOR);
    admin = await loginAs(ctx, RolUsuario.ADMIN);
  });

  afterAll(async () => {
    await truncateAll(ctx.prisma);
    await closeTestApp(ctx);
  });

  async function crearInventarioComo(token: string): Promise<InventarioBody> {
    const almacen = await crearAlmacen(ctx.prisma);
    const res = await agent(ctx.app)
      .post('/api/inventarios')
      .set('Authorization', `Bearer ${token}`)
      .send({ almacenId: almacen.id })
      .expect(201);
    return res.body as InventarioBody;
  }

  it('OPERARIO recibe 403 en PATCH /inventarios/:id/estado', async () => {
    const inventario = await crearInventarioComo(operario.token);

    await agent(ctx.app)
      .patch(`/api/inventarios/${inventario.id}/estado`)
      .set('Authorization', `Bearer ${operario.token}`)
      .send({ estado: 'EN_AUDITORIA' })
      .expect(403);
  });

  it('OPERARIO recibe 403 en POST /inventarios/:id/auditoria-ciega', async () => {
    const inventario = await crearInventarioComo(operario.token);

    await agent(ctx.app)
      .post(`/api/inventarios/${inventario.id}/auditoria-ciega`)
      .set('Authorization', `Bearer ${operario.token}`)
      .expect(403);
  });

  it('AUDITOR puede hacer PATCH /inventarios/:id/estado', async () => {
    const inventario = await crearInventarioComo(operario.token);

    await agent(ctx.app)
      .patch(`/api/inventarios/${inventario.id}/estado`)
      .set('Authorization', `Bearer ${auditor.token}`)
      .send({ estado: 'EN_AUDITORIA' })
      .expect(200);
  });

  it('ADMIN puede hacer POST /inventarios/:id/auditoria-ciega', async () => {
    const inventario = await crearInventarioComo(operario.token);

    await agent(ctx.app)
      .post(`/api/inventarios/${inventario.id}/auditoria-ciega`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(201);
  });
});
