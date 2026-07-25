import { RolUsuario, type Usuario } from '../../src/generated/prisma/client';
import { crearUsuarioDemo } from './seed-fixtures';
import type { TestAppContext } from './test-app';
import { agent } from './http';

export interface LoggedInUser {
  usuario: Usuario;
  token: string;
}

interface LoginResponseBody {
  accessToken: string;
}

/** Siembra un usuario del rol dado y hace login real vía HTTP para obtener un JWT válido. */
export async function loginAs(
  ctx: TestAppContext,
  rol: RolUsuario = RolUsuario.OPERARIO,
): Promise<LoggedInUser> {
  const { usuario, password } = await crearUsuarioDemo(ctx.prisma, rol);

  const res = await agent(ctx.app)
    .post('/api/auth/login')
    .send({ email: usuario.email, password })
    .expect(200);

  const body = res.body as LoginResponseBody;
  return { usuario, token: body.accessToken };
}
