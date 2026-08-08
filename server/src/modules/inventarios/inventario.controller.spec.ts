import { InventarioController } from './inventario.controller';
import type { InventarioService } from './inventario.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { RolUsuario } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';

/**
 * Lee metadata de `@Roles()` de un método del controller. Nest guarda esta
 * metadata directamente sobre la función del método (no sobre target+key),
 * así que hace falta leer la referencia del método sin invocarla — de ahí el
 * disable puntual de `unbound-method` en cada sitio de uso: no es un
 * callback con `this`, solo se inspecciona su metadata.
 */
function rolesDe(metodo: object): RolUsuario[] | undefined {
  return Reflect.getMetadata(ROLES_KEY, metodo) as RolUsuario[] | undefined;
}

describe('InventarioController', () => {
  function buildController() {
    // Sin castear a InventarioService acá: el tipo se infiere como objeto
    // plano con propiedades jest.Mock, así `service.metodo` en los asserts
    // no dispara `unbound-method` (esa regla solo mira métodos de clase).
    const service = {
      crear: jest.fn().mockResolvedValue({ id: 'inv-1' }),
      findDetalle: jest.fn().mockResolvedValue({ id: 'inv-1' }),
      procesarTomaPorVoz: jest.fn().mockResolvedValue({ inventario: {} }),
      cambiarEstado: jest.fn().mockResolvedValue({ id: 'inv-1' }),
      resolverAlerta: jest.fn().mockResolvedValue({ id: 'alerta-1' }),
      crearAuditoriaCiega: jest.fn().mockResolvedValue({ id: 'inv-2' }),
      compararAuditoria: jest.fn().mockResolvedValue({ items: [] }),
    };
    const controller = new InventarioController(
      service as unknown as InventarioService,
    );
    return { controller, service };
  }

  const usuario: AuthenticatedUser = {
    id: 'user-1',
    email: 'op@demo.com',
    nombre: 'Op',
    rol: RolUsuario.OPERARIO,
    organizacionId: 'org-test-1',
  };

  it('crear() usa usuario.id del JWT como usuarioId, nunca un valor del body', () => {
    const { controller, service } = buildController();

    void controller.crear({ almacenId: 'alm-1' }, usuario);

    expect(service.crear).toHaveBeenCalledWith({
      almacenId: 'alm-1',
      usuarioId: 'user-1',
      fechaCorte: undefined,
    });
  });

  it('crearAuditoriaCiega() usa usuario.id del JWT como auditorId', () => {
    const { controller, service } = buildController();

    void controller.crearAuditoriaCiega('inv-1', usuario);

    expect(service.crearAuditoriaCiega).toHaveBeenCalledWith('inv-1', 'user-1');
  });

  it('procesarVoz() delega id + texto sin pasar usuarioId', () => {
    const { controller, service } = buildController();

    void controller.procesarVoz('inv-1', { texto: 'cinco kilos de arroz' });

    expect(service.procesarTomaPorVoz).toHaveBeenCalledWith(
      'inv-1',
      'cinco kilos de arroz',
    );
  });

  it('cambiarEstado() y crearAuditoriaCiega() están restringidos a AUDITOR/ADMIN', () => {
    expect(
      // eslint-disable-next-line @typescript-eslint/unbound-method
      rolesDe(InventarioController.prototype.cambiarEstado),
    ).toEqual([RolUsuario.AUDITOR, RolUsuario.ADMIN]);
    expect(
      // eslint-disable-next-line @typescript-eslint/unbound-method
      rolesDe(InventarioController.prototype.crearAuditoriaCiega),
    ).toEqual([RolUsuario.AUDITOR, RolUsuario.ADMIN]);
  });

  it('procesarVoz() y crear() no declaran restricción de rol (abiertos a los 3 roles)', () => {
    expect(
      // eslint-disable-next-line @typescript-eslint/unbound-method
      rolesDe(InventarioController.prototype.procesarVoz),
    ).toBeUndefined();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(rolesDe(InventarioController.prototype.crear)).toBeUndefined();
  });
});
