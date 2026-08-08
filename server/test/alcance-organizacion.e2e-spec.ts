import './utils/env';
import { ContextoOrganizacionService } from '../src/prisma/contexto-organizacion.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Prueba el mecanismo que sostiene TODO el aislamiento multi-tenant: que el
 * alcance de organización viaje desde `AsyncLocalStorage` hasta el GUC
 * `app.organizacion_id` de la conexión física de Postgres, que es lo que
 * leen las policies de RLS.
 *
 * Esto depende de un detalle no obvio de la versión de Prisma: Prisma 7 no
 * tiene motor Rust, así que el camino de `prisma.x.findMany()` a
 * `pool.connect()` es JS en proceso y el contexto de ALS sobrevive. Si una
 * actualización de Prisma reintrodujera una frontera napi/worker, estos
 * tests fallan — que es exactamente lo que se quiere, porque en ese
 * escenario RLS dejaría de recibir el tenant y habría que migrar a la
 * variante `SET LOCAL` dentro de transacción (ver pool-con-alcance.ts).
 */
describe('Alcance de organización — propagación hasta la conexión de Postgres', () => {
  let contexto: ContextoOrganizacionService;
  let prisma: PrismaService;

  const leerGuc = async (
    cliente: { $queryRaw: PrismaService['$queryRaw'] } = prisma,
  ): Promise<string> => {
    const [fila] = await cliente.$queryRaw<{ org: string | null }[]>`
      SELECT current_setting('app.organizacion_id', true) AS org
    `;
    return fila.org ?? '(null)';
  };

  beforeAll(async () => {
    contexto = new ContextoOrganizacionService();
    prisma = new PrismaService(contexto);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('sin contexto el GUC queda vacío (bajo RLS eso es fallar CERRADA, no abierta)', async () => {
    await expect(leerGuc()).resolves.toBe('');
  });

  it('dentro de un alcance, el GUC llega hasta la conexión', async () => {
    await contexto.ejecutarConOrganizacion('org-A', async () => {
      await expect(leerGuc()).resolves.toBe('org-A');
    });
  });

  it('al salir del alcance el GUC no queda rancio en la conexión reutilizada', async () => {
    await contexto.ejecutarConOrganizacion('org-A', () => leerGuc());
    // Si el pool no re-estampara en cada checkout, esta consulta heredaría
    // "org-A" — una fuga silenciosa hacia el siguiente request.
    await expect(leerGuc()).resolves.toBe('');
  });

  it('sigue vigente dentro de una transacción interactiva', async () => {
    await contexto.ejecutarConOrganizacion('org-B', async () => {
      await prisma.$transaction(async (tx) => {
        await expect(leerGuc(tx)).resolves.toBe('org-B');
      });
    });
  });

  it('`sinAlcanceDeOrganizacion` prende el GUC de bypass', async () => {
    await prisma.sinAlcanceDeOrganizacion('test: escotilla', async () => {
      const [fila] = await prisma.$queryRaw<{ omitir: string | null }[]>`
        SELECT current_setting('app.omitir_rls', true) AS omitir
      `;
      expect(fila.omitir).toBe('on');
    });
  });

  it('60 consultas concurrentes de 4 organizaciones no se cruzan entre sí', async () => {
    // El caso que rompería un GUC de sesión mal manejado: varias
    // organizaciones compitiendo por las mismas conexiones del pool.
    const orgs = ['org-1', 'org-2', 'org-3', 'org-4'];
    const resultados = await Promise.all(
      orgs.flatMap((org) =>
        Array.from({ length: 15 }, () =>
          contexto.ejecutarConOrganizacion(org, async () => {
            await new Promise((r) => setTimeout(r, Math.random() * 20));
            return { esperado: org, real: await leerGuc() };
          }),
        ),
      ),
    );

    expect(resultados.filter((r) => r.real !== r.esperado)).toEqual([]);
  });

  it('la app se niega a arrancar si se conecta con un rol privilegiado', async () => {
    // Un superusuario se salta RLS SIEMPRE, incluso con FORCE ROW LEVEL
    // SECURITY: si la app corriera así, el aislamiento sería falso y los
    // demás tests de este repo pasarían igual. De ahí la verificación.
    const urlDueno = process.env.DATABASE_URL_MIGRATIONS;
    if (!urlDueno) {
      throw new Error('DATABASE_URL_MIGRATIONS es requerida para este test');
    }

    const urlApp = process.env.DATABASE_URL;
    process.env.DATABASE_URL = urlDueno;
    const prismaPrivilegiado = new PrismaService(
      new ContextoOrganizacionService(),
    );
    process.env.DATABASE_URL = urlApp;

    try {
      await expect(prismaPrivilegiado.onModuleInit()).rejects.toThrow(
        /rol privilegiado/,
      );
    } finally {
      await prismaPrivilegiado.$disconnect();
    }
  });
});
