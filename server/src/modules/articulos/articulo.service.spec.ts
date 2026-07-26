import { ArticuloService } from './articulo.service';
import type { ArticuloRepository } from './articulo.repository';
import type { Articulo } from '../../generated/prisma/client';

function buildArticulo(overrides: Partial<Articulo> = {}): Articulo {
  return {
    id: 'art-1',
    sku: '123',
    nombre: 'PAPA CRIOLLA',
    aliases: ['papa amarilla'],
    categoria: 'Verduras',
    unidadEstd: 'KILOGRAMO',
    esProcesado: false,
    stockHistoricoAvg: 50,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ArticuloService.normalizarEntradaHablada', () => {
  function buildService(findBestMatches: jest.Mock) {
    const repository = {
      findBestMatches,
    } as unknown as ArticuloRepository;
    return new ArticuloService(repository);
  }

  it('devuelve null sin consultar el repositorio si el texto normalizado queda vacío', async () => {
    const findBestMatches = jest.fn();
    const service = buildService(findBestMatches);

    // "kilos de" son solo unidad+conector — sin número (que ya no se
    // descarta, ver articulo-text.util.spec.ts) ni nombre, normaliza a "".
    const result = await service.normalizarEntradaHablada('kilos de');

    expect(result).toEqual({ textoNormalizado: '', articulo: null, score: 0 });
    expect(findBestMatches).not.toHaveBeenCalled();
  });

  it('devuelve el artículo cuando el mejor match supera el umbral mínimo y no hay ambigüedad', async () => {
    const articulo = buildArticulo();
    const findBestMatches = jest
      .fn()
      .mockResolvedValue([{ ...articulo, score: 0.9 }]);
    const service = buildService(findBestMatches);

    const result = await service.normalizarEntradaHablada(
      'kilos de papa criolla',
    );

    expect(result.articulo).toEqual(articulo);
    expect(result.score).toBe(0.9);
    expect(result.candidatosAmbiguos).toBeUndefined();
    // Pide top-3 (no solo el top-1) para poder detectar ambigüedad.
    expect(findBestMatches).toHaveBeenCalledWith('papa criolla', 3);
  });

  it('devuelve el artículo si el runner-up existe pero está lejos en score (sin ambigüedad)', async () => {
    const articulo = buildArticulo();
    const findBestMatches = jest.fn().mockResolvedValue([
      { ...articulo, score: 0.9 },
      { ...buildArticulo({ id: 'art-2', nombre: 'PAPA PASTUSA' }), score: 0.5 },
    ]);
    const service = buildService(findBestMatches);

    const result = await service.normalizarEntradaHablada('papa criolla');

    expect(result.articulo).toEqual(articulo);
    expect(result.candidatosAmbiguos).toBeUndefined();
  });

  it('detecta ambigüedad cuando el top-1 y el runner-up quedan a menos de 0.15 de distancia', async () => {
    const rojo = buildArticulo({
      id: 'art-rojo',
      nombre: 'CEBOLLA CABEZONA ROJA',
    });
    const blanco = buildArticulo({
      id: 'art-blanco',
      nombre: 'CEBOLLA CABEZONA BLANCA',
    });
    const findBestMatches = jest.fn().mockResolvedValue([
      { ...rojo, score: 1.25 },
      { ...blanco, score: 1.25 },
    ]);
    const service = buildService(findBestMatches);

    const result = await service.normalizarEntradaHablada('cebolla cabezona');

    expect(result.articulo).toBeNull();
    expect(result.candidatosAmbiguos).toHaveLength(2);
    expect(result.candidatosAmbiguos?.map((a) => a.id)).toEqual([
      'art-rojo',
      'art-blanco',
    ]);
    // El candidato ambiguo tampoco debe filtrar el campo "score".
    expect(result.candidatosAmbiguos?.[0]).not.toHaveProperty('score');
  });

  it('no considera ambiguo un runner-up que no supera el umbral mínimo, aunque esté cerca en score', async () => {
    const articulo = buildArticulo();
    const findBestMatches = jest.fn().mockResolvedValue([
      { ...articulo, score: 0.4 },
      { ...buildArticulo({ id: 'art-2' }), score: 0.3 }, // por debajo de 0.35
    ]);
    const service = buildService(findBestMatches);

    const result = await service.normalizarEntradaHablada('papa criolla');

    expect(result.articulo).toEqual(articulo);
    expect(result.candidatosAmbiguos).toBeUndefined();
  });

  it('rechaza el match si el score queda por debajo del umbral (0.35)', async () => {
    const findBestMatches = jest
      .fn()
      .mockResolvedValue([{ ...buildArticulo(), score: 0.2 }]);
    const service = buildService(findBestMatches);

    const result = await service.normalizarEntradaHablada('algo irreconocible');

    expect(result.articulo).toBeNull();
    expect(result.score).toBe(0.2);
  });

  it('devuelve null cuando no hay ningún candidato en el catálogo', async () => {
    const findBestMatches = jest.fn().mockResolvedValue([]);
    const service = buildService(findBestMatches);

    const result = await service.normalizarEntradaHablada('inexistente');

    expect(result).toEqual({
      textoNormalizado: 'inexistente',
      articulo: null,
      score: 0,
    });
  });

  it('no filtra el campo "score" hacia el objeto Articulo devuelto', async () => {
    const findBestMatches = jest
      .fn()
      .mockResolvedValue([{ ...buildArticulo(), score: 0.8 }]);
    const service = buildService(findBestMatches);

    const result = await service.normalizarEntradaHablada('papa criolla');

    expect(result.articulo).not.toHaveProperty('score');
  });
});
