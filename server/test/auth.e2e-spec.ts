import { RolUsuario } from '../src/generated/prisma/client';
import {
  closeTestApp,
  createTestApp,
  type TestAppContext,
} from './utils/test-app';
import { truncateAll } from './utils/db-reset';
import { crearUsuarioDemo } from './utils/seed-fixtures';
import { agent } from './utils/http';

interface LoginResponseBody {
  accessToken: string;
  usuario: { id: string; email: string; rol: RolUsuario };
}

describe('Auth (e2e)', () => {
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

  it('POST /api/auth/login devuelve un JWT válido con credenciales correctas', async () => {
    const { usuario, password } = await crearUsuarioDemo(
      ctx.prisma,
      RolUsuario.OPERARIO,
    );

    const res = await agent(ctx.app)
      .post('/api/auth/login')
      .send({ email: usuario.email, password })
      .expect(200);

    const body = res.body as LoginResponseBody;
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.usuario).toMatchObject({
      id: usuario.id,
      email: usuario.email,
      rol: RolUsuario.OPERARIO,
    });
  });

  it('POST /api/auth/login rechaza credenciales incorrectas con 401', async () => {
    const { usuario } = await crearUsuarioDemo(ctx.prisma, RolUsuario.OPERARIO);

    await agent(ctx.app)
      .post('/api/auth/login')
      .send({ email: usuario.email, password: 'password-incorrecto' })
      .expect(401);
  });

  it('POST /api/auth/login rechaza un email que no existe con 401 (mismo mensaje que password incorrecto)', async () => {
    await agent(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'no-existe@invencheck.test', password: 'lo-que-sea' })
      .expect(401);
  });

  it('rutas protegidas devuelven 401 sin token', async () => {
    await agent(ctx.app).get('/api/inventarios/algun-id').expect(401);
  });
});
