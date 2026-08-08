import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

/**
 * Alcance de tenancy de una unidad de trabajo (típicamente un request HTTP,
 * pero también una corrida de un script CLI o de un fixture de test).
 */
export interface AlcanceOrganizacion {
  /** cuid de la Organizacion dueña de todo lo que se lea/escriba acá dentro. */
  organizacionId?: string;
  /**
   * Solo lo prende `PrismaService.sinAlcanceDeOrganizacion()`. Desactiva
   * tanto la extensión de Prisma como las policies de RLS (vía el GUC
   * `app.omitir_rls`). Ver la advertencia en ese método antes de usarlo.
   */
  omitirAislamiento?: boolean;
  /** Por qué se omitió el aislamiento — se loguea, para que nunca sea silencioso. */
  motivo?: string;
}

/**
 * Transporta la organización "actual" a través de toda la cadena async de una
 * unidad de trabajo, sin tener que pasarla como parámetro por cada capa
 * (controller -> service -> repository -> Prisma).
 *
 * Lo consumen dos piezas que no se hablan entre sí:
 *  1. `extensionAlcanceOrganizacion` — inyecta `organizacionId` en los
 *     `where`/`data` de Prisma.
 *  2. `PoolConAlcanceDeOrganizacion` — estampa el GUC `app.organizacion_id`
 *     en cada conexión que se saca del pool, que es lo que hace que las
 *     policies de RLS de Postgres puedan evaluarse.
 *
 * Esto funciona porque Prisma 7 no tiene motor Rust: el camino desde
 * `prisma.articulo.findMany()` hasta `pool.connect()` es JavaScript en
 * proceso (query compiler WASM + `@prisma/query-plan-executor`), así que el
 * contexto de `AsyncLocalStorage` sobrevive hasta el driver adapter. Con el
 * motor Rust de Prisma <= 6 esto se rompería en silencio, porque la conexión
 * se pedía del otro lado de una frontera napi.
 */
@Injectable()
export class ContextoOrganizacionService {
  private readonly als = new AsyncLocalStorage<AlcanceOrganizacion>();

  /**
   * Abre un alcance y corre `fn` dentro.
   *
   * El objeto de alcance es MUTABLE a propósito: el middleware que lo abre
   * corre ANTES que los guards de Nest, cuando `request.user` todavía no
   * existe y por lo tanto la organización aún no se conoce.
   * `JwtStrategy.validate` la completa después con `asignar()`, sin tener
   * que reabrir el contexto ni envolver nada de nuevo.
   */
  ejecutar<T>(alcance: AlcanceOrganizacion, fn: () => T): T {
    return this.als.run(alcance, fn);
  }

  /**
   * Alcance cerrado de una sola organización, ya conocida de antemano.
   * Para scripts CLI, seed y fixtures de test, donde no hay un JWT que
   * resolver — ver `src/scripts/import-excel.ts`.
   */
  ejecutarConOrganizacion<T>(
    organizacionId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    return this.als.run({ organizacionId }, fn);
  }

  /** Completa la organización de un alcance ya abierto (ver `ejecutar`). */
  asignar(organizacionId: string): void {
    const alcance = this.als.getStore();
    if (!alcance) {
      throw new Error(
        'No hay un alcance de organización abierto; falta AlcanceOrganizacionMiddleware ' +
          'o una llamada a ContextoOrganizacionService.ejecutar().',
      );
    }
    alcance.organizacionId = organizacionId;
  }

  /** `undefined` si no hay ningún alcance abierto (ej. un script sin envolver). */
  actual(): AlcanceOrganizacion | undefined {
    return this.als.getStore();
  }
}
