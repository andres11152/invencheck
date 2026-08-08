import { Test } from '@nestjs/testing';
import { ContextoOrganizacionService } from '../src/prisma/contexto-organizacion.service';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ArticulosModule } from '../src/modules/articulos/articulos.module';
import { ArticuloRepository } from '../src/modules/articulos/articulo.repository';
import { ArticuloService } from '../src/modules/articulos/articulo.service';
import { UnidadMedida } from '../src/generated/prisma/client';
import { truncateAll } from './utils/db-reset';
import { crearArticulo, crearOrganizacion } from './utils/seed-fixtures';
import './utils/env';

/**
 * `findBestMatches` usa similitud de trigramas (pg_trgm) + `f_unaccent` en
 * SQL crudo — no se puede mockear, necesita Postgres real con las
 * extensiones/función que crean las migraciones de fuzzy search.
 *
 * A diferencia de los demás e2e (que pasan por `createTestApp()` y por lo
 * tanto por `AlcanceOrganizacionMiddleware`), este spec arma un módulo de
 * Nest reducido (solo `PrismaModule` + `ArticulosModule`, sin HTTP) — así
 * que el alcance de organización se abre a mano en cada test.
 */
describe('ArticuloRepository.findBestMatches (e2e)', () => {
  let prisma: PrismaService;
  let contexto: ContextoOrganizacionService;
  let repo: ArticuloRepository;
  let articuloService: ArticuloService;
  let organizacionId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, ArticulosModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    contexto = moduleRef.get(ContextoOrganizacionService);
    repo = moduleRef.get(ArticuloRepository);
    articuloService = moduleRef.get(ArticuloService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Una organización nueva por test: `truncateAll` (afterEach) la borra, así
  // que no puede crearse en `beforeAll` — moriría después del primer test.
  beforeEach(async () => {
    organizacionId = (await crearOrganizacion(prisma)).id;
  });

  afterEach(async () => {
    await truncateAll(prisma);
  });

  /** Todas las llamadas al repo/servicio de este spec necesitan el alcance abierto. */
  function conAlcance<T>(fn: () => Promise<T>): Promise<T> {
    return contexto.ejecutarConOrganizacion(organizacionId, fn);
  }

  it('matchea por alias exacto y prioriza el artículo correcto', async () => {
    const papaCriolla = await crearArticulo(prisma, {
      organizacionId,
      nombre: 'PAPA CRIOLLA',
      aliases: ['papa criolla', 'papa amarilla'],
      categoria: 'Verduras',
      unidadEstd: UnidadMedida.KILOGRAMO,
    });
    await crearArticulo(prisma, {
      organizacionId,
      nombre: 'CERVEZA HEINEKEN CERO',
      aliases: ['heineken cero', 'cerveza sin alcohol'],
      categoria: 'Bebidas',
    });

    const [top] = await conAlcance(() =>
      repo.findBestMatches('papa criolla', 5),
    );

    expect(top.id).toBe(papaCriolla.id);
    expect(top.score).toBeGreaterThan(0.35);
  });

  it('ignora acentos gracias a f_unaccent al matchear contra el nombre/alias', async () => {
    const ajiCasero = await crearArticulo(prisma, {
      organizacionId,
      nombre: 'AJÍ CASERO PISCILAGO (PA)',
      aliases: ['aji casero', 'aji piscilago'],
      categoria: 'Salsas y Aderezos',
      unidadEstd: UnidadMedida.LITRO,
      esProcesado: true,
    });
    await crearArticulo(prisma, {
      organizacionId,
      nombre: 'ARROZ BLANCO EXCELSO',
      aliases: ['arroz blanco'],
      categoria: 'Abarrotes',
    });

    // Query sin acentos, tal como llega ya normalizada desde `normalizeSpokenText`.
    const [top] = await conAlcance(() => repo.findBestMatches('aji casero', 5));

    expect(top.id).toBe(ajiCasero.id);
    expect(top.score).toBeGreaterThan(0.35);
  });

  it('respeta el LIMIT y ordena por score descendente', async () => {
    await crearArticulo(prisma, {
      organizacionId,
      nombre: 'PAPA CRIOLLA',
      aliases: ['papa criolla'],
    });
    await crearArticulo(prisma, {
      organizacionId,
      nombre: 'PAPA PASTUSA',
      aliases: ['papa pastusa'],
    });
    await crearArticulo(prisma, {
      organizacionId,
      nombre: 'PAPA SABANERA',
      aliases: ['papa sabanera'],
    });

    const results = await conAlcance(() =>
      repo.findBestMatches('papa criolla', 2),
    );

    expect(results).toHaveLength(2);
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });

  it('un texto sin relación con el catálogo obtiene un score bajo (no confiable)', async () => {
    await crearArticulo(prisma, {
      organizacionId,
      nombre: 'PAPA CRIOLLA',
      aliases: ['papa criolla'],
    });

    const [top] = await conAlcance(() =>
      repo.findBestMatches('bombillo led veinte vatios', 5),
    );

    expect(top.score).toBeLessThan(0.35);
  });

  /**
   * Regresión del hallazgo central de la auditoría real
   * (audit-voice-matching.ts): dos variantes de color del mismo producto
   * generaban el mismo alias corto y el top-1 se auto-confirmaba en
   * silencio contra el artículo incorrecto. Ahora ArticuloService debe
   * detectar la ambigüedad (no elegir ninguno) en vez de adivinar.
   */
  it('ArticuloService detecta ambigüedad real entre dos variantes de color y no elige ninguna', async () => {
    await crearArticulo(prisma, {
      organizacionId,
      nombre: 'CEBOLLA CABEZONA ROJA',
      aliases: ['cebolla cabezona', 'cebolla roja'],
      categoria: 'Verduras',
    });
    await crearArticulo(prisma, {
      organizacionId,
      nombre: 'CEBOLLA CABEZONA BLANCA',
      aliases: ['cebolla cabezona', 'cebolla blanca'],
      categoria: 'Verduras',
    });

    const match = await conAlcance(() =>
      articuloService.normalizarEntradaHablada('cebolla cabezona'),
    );

    expect(match.articulo).toBeNull();
    expect(match.candidatosAmbiguos).toHaveLength(2);
    expect(match.candidatosAmbiguos?.map((a) => a.nombre).sort()).toEqual([
      'CEBOLLA CABEZONA BLANCA',
      'CEBOLLA CABEZONA ROJA',
    ]);
  });

  it('ArticuloService NO detecta ambigüedad cuando el operario sí especifica la variante', async () => {
    const roja = await crearArticulo(prisma, {
      organizacionId,
      nombre: 'CEBOLLA CABEZONA ROJA',
      aliases: ['cebolla cabezona', 'cebolla roja'],
      categoria: 'Verduras',
    });
    await crearArticulo(prisma, {
      organizacionId,
      nombre: 'CEBOLLA CABEZONA BLANCA',
      aliases: ['cebolla cabezona', 'cebolla blanca'],
      categoria: 'Verduras',
    });

    const match = await conAlcance(() =>
      articuloService.normalizarEntradaHablada('cebolla roja'),
    );

    expect(match.articulo?.id).toBe(roja.id);
    expect(match.candidatosAmbiguos).toBeUndefined();
  });

  /**
   * Regresión de un bug real reportado en producción: dictar "arroz" con el
   * catálogo real (938 artículos) auto-confirmaba en silencio contra el
   * artículo "ARROZ" (bonus de nombre EXACTO en findBestMatches, score 1.5)
   * mientras "ARROZ DOÑA PEPA"/"ARROZ BASMATI" quedaban con score ~0.8 —
   * gap de 0.7, muy por encima de AMBIGUEDAD_GAP (0.3), así que el chequeo
   * de gap por sí solo NUNCA detecta este caso. Confirmado con una consulta
   * directa a Postgres en producción antes de corregir.
   */
  it('un nombre EXACTO que también es prefijo de variantes más específicas se marca como ambigüedad (caso real: "arroz", con las 5 variantes reales del catálogo)', async () => {
    const arroz = await crearArticulo(prisma, {
      organizacionId,
      nombre: 'ARROZ',
      categoria: 'AYB',
    });
    await crearArticulo(prisma, {
      organizacionId,
      nombre: 'ARROZ DOÑA PEPA',
      aliases: ['arroz dona pepa', 'arroz pepa'],
      categoria: 'AYB',
    });
    await crearArticulo(prisma, {
      organizacionId,
      nombre: 'ARROZ BASMATI',
      categoria: 'AYB',
    });
    await crearArticulo(prisma, {
      organizacionId,
      nombre: 'ARROZ FEDERAL',
      categoria: 'AYB',
    });
    await crearArticulo(prisma, {
      organizacionId,
      nombre: 'ARROZ PARA SUSHI',
      categoria: 'AYB',
    });
    await crearArticulo(prisma, {
      organizacionId,
      nombre: 'ARROZ BLANCO EXCELSO 500G',
      aliases: ['arroz blanco', 'arroz excelso'],
      categoria: 'AYB',
    });
    // No debe confundirse con productos donde "arroz" no es el primer
    // token — esos son productos distintos, no variantes de "arroz".
    await crearArticulo(prisma, {
      organizacionId,
      nombre: 'VINAGRE DE ARROZ',
      categoria: 'AYB',
      unidadEstd: UnidadMedida.LITRO,
    });

    await conAlcance(async () => {
      // El gap de score real entre "ARROZ" y sus variantes es grande —
      // confirma que el gap por sí solo no alcanzaría para detectar esto.
      const [top, segundo] = await repo.findBestMatches('arroz', 3);
      expect(top.id).toBe(arroz.id);
      expect(top.score - segundo.score).toBeGreaterThan(0.3);

      const match = await articuloService.normalizarEntradaHablada('arroz');

      expect(match.articulo).toBeNull();
      // Las 5 variantes reales del catálogo (el peor caso real del catálogo
      // completo, ver el límite en findByNamePrefix) caben todas — ninguna
      // se corta.
      const nombres = match.candidatosAmbiguos?.map((a) => a.nombre).sort();
      expect(nombres).toEqual([
        'ARROZ',
        'ARROZ BASMATI',
        'ARROZ BLANCO EXCELSO 500G',
        'ARROZ DOÑA PEPA',
        'ARROZ FEDERAL',
        'ARROZ PARA SUSHI',
      ]);
    });
  });

  it('un nombre exacto sin ninguna variante más específica en el catálogo no se marca como ambigüedad', async () => {
    const sal = await crearArticulo(prisma, {
      organizacionId,
      nombre: 'SAL',
      categoria: 'AYB',
    });

    const match = await conAlcance(() =>
      articuloService.normalizarEntradaHablada('sal'),
    );

    expect(match.articulo?.id).toBe(sal.id);
    expect(match.candidatosAmbiguos).toBeUndefined();
  });
});
