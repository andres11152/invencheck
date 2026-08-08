import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { ContextoOrganizacionService } from './contexto-organizacion.service';
import { PoolConAlcanceDeOrganizacion } from './pool-con-alcance';

interface RolActual {
  nombre: string;
  es_superusuario: boolean;
  omite_rls: boolean;
}

/**
 * Cliente de Prisma SIN alcance de organización.
 *
 * En código de aplicación NO se inyecta este: se inyecta el token
 * `PRISMA_ORG` (ver prisma.module.ts), que es este mismo cliente envuelto en
 * la extensión que filtra por organización. Este queda expuesto solo para
 * las operaciones legítimamente cross-tenant o pre-tenant, y siempre a
 * través de `sinAlcanceDeOrganizacion()`.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly contexto: ContextoOrganizacionService) {
    super({
      // Se le pasa una instancia propia de `pg.Pool` (soportado por
      // @prisma/adapter-pg) en vez de una connection string, para poder
      // estampar el alcance de organización en cada checkout de conexión.
      // Ver pool-con-alcance.ts.
      adapter: new PrismaPg(
        new PoolConAlcanceDeOrganizacion(
          { connectionString: process.env.DATABASE_URL },
          contexto,
        ),
      ),
    });
  }

  async onModuleInit() {
    await this.$connect();
    await this.verificarRolNoPrivilegiado();
    this.logger.log('Conexión a PostgreSQL establecida');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Corre `fn` SIN aislamiento por organización: prende `app.omitir_rls` en
   * la conexión y desactiva la extensión de Prisma.
   *
   * Solo para operaciones legítimamente cross-tenant o pre-tenant (resolver
   * el login desde un email que es único global, resetear la base en los
   * tests). Todo uso nuevo tiene que agregarse al allowlist de
   * `prisma.service.escotillas.spec.ts`, que falla si aparece una llamada no
   * declarada — la idea es que un bypass nunca entre por accidente.
   *
   * Nota honesta sobre el modelo de amenaza: `app.omitir_rls` es un GUC, así
   * que una inyección SQL sobre la conexión de la app podría prenderlo. RLS
   * acá es un backstop contra BUGS DE APLICACIÓN (un `where` olvidado, un
   * `$queryRaw` nuevo sin filtro), no un control anti-inyección. Si eso
   * llegara a importar, el upgrade es un rol aparte con BYPASSRLS y su
   * propio pool.
   */
  sinAlcanceDeOrganizacion<T>(
    motivo: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    this.logger.warn(`Consulta sin alcance de organización: ${motivo}`);
    return this.contexto.ejecutar({ omitirAislamiento: true, motivo }, fn);
  }

  /**
   * Se niega a arrancar si la app se conecta con un rol privilegiado.
   *
   * Un superusuario (o un rol con BYPASSRLS) se salta las policies de RLS
   * SIEMPRE — incluso con `FORCE ROW LEVEL SECURITY`. Si la app corriera con
   * ese rol, todas las policies quedarían inertes y los tests de aislamiento
   * pasarían en verde mientras producción filtra datos entre clientes. El
   * rol por defecto de docker-compose (`invencheck`) es exactamente ese
   * caso, así que esto no es hipotético.
   */
  private async verificarRolNoPrivilegiado(): Promise<void> {
    const [rol] = await this.$queryRaw<RolActual[]>`
      SELECT rolname AS nombre,
             rolsuper AS es_superusuario,
             rolbypassrls AS omite_rls
      FROM pg_roles
      WHERE rolname = current_user
    `;

    if (rol?.es_superusuario || rol?.omite_rls) {
      throw new Error(
        `DATABASE_URL se conecta con el rol privilegiado "${rol.nombre}" ` +
          `(superusuario=${rol.es_superusuario}, bypassrls=${rol.omite_rls}): ` +
          'las policies de RLS quedarían inertes y el aislamiento entre ' +
          'organizaciones sería falso. Usa el rol invencheck_app — ver la ' +
          'migración _rol_aplicacion_sin_privilegios y server/.env.example.',
      );
    }
  }
}
