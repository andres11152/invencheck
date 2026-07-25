import { Test } from '@nestjs/testing';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ArticulosModule } from '../src/modules/articulos/articulos.module';
import { ArticuloRepository } from '../src/modules/articulos/articulo.repository';
import { UnidadMedida } from '../src/generated/prisma/client';
import { truncateAll } from './utils/db-reset';
import { crearArticulo } from './utils/seed-fixtures';
import './utils/env';

/**
 * `findBestMatches` usa similitud de trigramas (pg_trgm) + `f_unaccent` en
 * SQL crudo — no se puede mockear, necesita Postgres real con las
 * extensiones/función que crean las migraciones de fuzzy search.
 */
describe('ArticuloRepository.findBestMatches (e2e)', () => {
  let prisma: PrismaService;
  let repo: ArticuloRepository;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, ArticulosModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    repo = moduleRef.get(ArticuloRepository);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await truncateAll(prisma);
  });

  it('matchea por alias exacto y prioriza el artículo correcto', async () => {
    const papaCriolla = await crearArticulo(prisma, {
      nombre: 'PAPA CRIOLLA',
      aliases: ['papa criolla', 'papa amarilla'],
      categoria: 'Verduras',
      unidadEstd: UnidadMedida.KILOGRAMO,
    });
    await crearArticulo(prisma, {
      nombre: 'CERVEZA HEINEKEN CERO',
      aliases: ['heineken cero', 'cerveza sin alcohol'],
      categoria: 'Bebidas',
    });

    const [top] = await repo.findBestMatches('papa criolla', 5);

    expect(top.id).toBe(papaCriolla.id);
    expect(top.score).toBeGreaterThan(0.35);
  });

  it('ignora acentos gracias a f_unaccent al matchear contra el nombre/alias', async () => {
    const ajiCasero = await crearArticulo(prisma, {
      nombre: 'AJÍ CASERO PISCILAGO (PA)',
      aliases: ['aji casero', 'aji piscilago'],
      categoria: 'Salsas y Aderezos',
      unidadEstd: UnidadMedida.LITRO,
      esProcesado: true,
    });
    await crearArticulo(prisma, {
      nombre: 'ARROZ BLANCO EXCELSO',
      aliases: ['arroz blanco'],
      categoria: 'Abarrotes',
    });

    // Query sin acentos, tal como llega ya normalizada desde `normalizeSpokenText`.
    const [top] = await repo.findBestMatches('aji casero', 5);

    expect(top.id).toBe(ajiCasero.id);
    expect(top.score).toBeGreaterThan(0.35);
  });

  it('respeta el LIMIT y ordena por score descendente', async () => {
    await crearArticulo(prisma, {
      nombre: 'PAPA CRIOLLA',
      aliases: ['papa criolla'],
    });
    await crearArticulo(prisma, {
      nombre: 'PAPA PASTUSA',
      aliases: ['papa pastusa'],
    });
    await crearArticulo(prisma, {
      nombre: 'PAPA SABANERA',
      aliases: ['papa sabanera'],
    });

    const results = await repo.findBestMatches('papa criolla', 2);

    expect(results).toHaveLength(2);
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });

  it('un texto sin relación con el catálogo obtiene un score bajo (no confiable)', async () => {
    await crearArticulo(prisma, {
      nombre: 'PAPA CRIOLLA',
      aliases: ['papa criolla'],
    });

    const [top] = await repo.findBestMatches('bombillo led veinte vatios', 5);

    expect(top.score).toBeLessThan(0.35);
  });
});
