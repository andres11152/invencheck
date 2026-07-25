import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';

describe('AuthController', () => {
  function buildController() {
    // Sin castear a AuthService acá: tipo inferido como objeto plano con
    // propiedades jest.Mock, para que `service.login` en el assert no
    // dispare `unbound-method` (esa regla solo mira métodos de clase).
    const service = {
      login: jest.fn().mockResolvedValue({ accessToken: 'jwt-token' }),
    };
    const controller = new AuthController(service as unknown as AuthService);
    return { controller, service };
  }

  it('login() delega email y password al AuthService', () => {
    const { controller, service } = buildController();

    void controller.login({ email: 'op@demo.com', password: 'secreto123' });

    expect(service.login).toHaveBeenCalledWith('op@demo.com', 'secreto123');
  });

  it('login() está marcado @Public() (no requiere JWT previo)', () => {
    // Nest guarda la metadata de @Public() sobre la función del método en
    // sí; leerla sin invocarla es intencional, no un callback con `this`.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const metodo: object = AuthController.prototype.login;
    const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, metodo) as boolean;
    expect(isPublic).toBe(true);
  });
});
