import { Pool, type PoolClient, type PoolConfig } from 'pg';
import type { ContextoOrganizacionService } from './contexto-organizacion.service';

/**
 * Fija los dos GUCs que leen las policies de RLS. `set_config(..., false)`
 * es de SESIÓN (no `LOCAL`), así que NO necesita una transacción abierta —
 * ese es el punto de todo este archivo.
 */
const SQL_APLICAR_ALCANCE =
  "SELECT set_config('app.organizacion_id', $1, false), " +
  "       set_config('app.omitir_rls', $2, false)";

type CallbackConexion = (
  err: Error | undefined,
  client: PoolClient | undefined,
  done: (release?: unknown) => void,
) => void;

/**
 * Pool de `pg` que estampa el alcance de organización en CADA checkout de
 * conexión, justo antes de que Prisma la use.
 *
 * ## Por qué acá y no con `SET LOCAL` dentro de una transacción
 *
 * `SET LOCAL` exige una transacción abierta. Aplicarlo obligaría a envolver
 * o bien cada request HTTP, o bien cada método de repositorio, en una
 * transacción interactiva:
 *
 *  - Por request es inviable: `InventarioService.procesarTomaPorVoz` llama a
 *    la API de Gemini a mitad del handler. Mantendría una conexión del pool
 *    tomada durante un round trip a un tercero (con reintentos), reventaría
 *    el timeout de transacción interactiva, y anidaría las transacciones que
 *    ya existen en `InventarioRepository` convirtiéndolas en savepoints —
 *    cambiando en silencio la atomicidad de la que dependen los fixes de
 *    lost-update y de alertas duplicadas.
 *  - Por método de repositorio son ~34 métodos reescritos y BEGIN/COMMIT en
 *    cada lectura.
 *
 * `set_config(..., false)` es de sesión y vive en la conexión física, así
 * que no necesita nada de eso. El riesgo clásico de un GUC de sesión con un
 * pool es que quede RANCIO: la próxima request agarra la misma conexión y
 * hereda el tenant anterior — una fuga, y encima fallando ABIERTA, el peor
 * modo posible. Se cierra estampándolo SIEMPRE, en TODOS los checkouts,
 * incluso cuando no hay organización en contexto: en ese caso queda en `''`,
 * ninguna fila matchea la policy, y la consulta falla CERRADA.
 *
 * ## Por qué basta con sobrescribir `connect()`
 *
 * `pg-pool` enruta `pool.query()` a través de `this.connect(cb)`
 * (node_modules/pg-pool/index.js), así que este único override cubre las dos
 * rutas por las que Prisma habla con Postgres: las consultas sueltas y
 * `startTransaction()` (que pide una conexión y luego emite BEGIN sobre
 * ella). Como el GUC se fija ANTES del BEGIN, sigue vigente durante toda la
 * transacción y ningún ROLLBACK lo revierte.
 *
 * ## Restricción de despliegue
 *
 * REQUIERE pooling a nivel de SESIÓN. Detrás de un pgbouncer/RDS Proxy en
 * modo `transaction` esto NO funciona — el proxy puede mover la sesión a
 * otra conexión backend entre el `set_config` y la consulta. En ese
 * escenario hay que migrar a la variante `SET LOCAL` dentro de transacción.
 */
export class PoolConAlcanceDeOrganizacion extends Pool {
  constructor(
    config: PoolConfig,
    private readonly contexto: ContextoOrganizacionService,
  ) {
    super(config);
  }

  connect(): Promise<PoolClient>;
  connect(cb: CallbackConexion): void;
  connect(cb?: CallbackConexion): Promise<PoolClient> | void {
    const promesa = super.connect().then(async (cliente) => {
      const alcance = this.contexto.actual();
      try {
        await cliente.query(SQL_APLICAR_ALCANCE, [
          alcance?.organizacionId ?? '',
          alcance?.omitirAislamiento ? 'on' : 'off',
        ]);
      } catch (error) {
        // Devolver la conexión al pool marcándola con el error: si no se
        // pudo aplicar el alcance, dejarla circular sería servir una
        // conexión con el GUC de otro tenant todavía puesto.
        cliente.release(error as Error);
        throw error;
      }
      return cliente;
    });

    if (!cb) return promesa;

    promesa.then(
      (cliente) =>
        cb(undefined, cliente, (release?: unknown) =>
          cliente.release(release as Error | undefined),
        ),
      (error: Error) => cb(error, undefined, () => {}),
    );
  }
}
