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

    const result = await service.normalizarEntradaHablada('cinco kilos de');

    expect(result).toEqual({ textoNormalizado: '', articulo: null, score: 0 });
    expect(findBestMatches).not.toHaveBeenCalled();
  });

  it('devuelve el artículo cuando el mejor match supera el umbral mínimo', async () => {
    const articulo = buildArticulo();
    const findBestMatches = jest
      .fn()
      .mockResolvedValue([{ ...articulo, score: 0.9 }]);
    const service = buildService(findBestMatches);

    const result = await service.normalizarEntradaHablada(
      'tres kilos de papa criolla',
    );

    expect(result.articulo).toEqual(articulo);
    expect(result.score).toBe(0.9);
    expect(findBestMatches).toHaveBeenCalledWith('papa criolla', 1);
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
