import { parseVoiceItemsLocally } from './voice-parser.util';
import { UnidadMedida } from '../../generated/prisma/client';

describe('parseVoiceItemsLocally', () => {
  it('parsea un solo ítem con número en palabras y unidad explícita', () => {
    const items = parseVoiceItemsLocally('quince kilos de papa criolla');

    expect(items).toEqual([
      {
        articuloBusqueda: 'papa criolla',
        cantidad: 15,
        unidadDictada: UnidadMedida.KILOGRAMO,
      },
    ]);
  });

  it('parsea dos ítems separados por "y"', () => {
    const items = parseVoiceItemsLocally(
      'quince kilos de papa criolla y noventa kilos de cebolla',
    );

    expect(items).toEqual([
      {
        articuloBusqueda: 'papa criolla',
        cantidad: 15,
        unidadDictada: UnidadMedida.KILOGRAMO,
      },
      {
        articuloBusqueda: 'cebolla',
        cantidad: 90,
        unidadDictada: UnidadMedida.KILOGRAMO,
      },
    ]);
  });

  it('acepta cantidades en dígitos, incluyendo decimales con punto', () => {
    const items = parseVoiceItemsLocally('2.5 litros de aceite');

    expect(items).toEqual([
      {
        articuloBusqueda: 'aceite',
        cantidad: 2.5,
        unidadDictada: UnidadMedida.LITRO,
      },
    ]);
  });

  it('usa UNIDAD por defecto cuando no se dicta ninguna unidad de medida', () => {
    const items = parseVoiceItemsLocally('diez huevos');

    expect(items).toEqual([
      {
        articuloBusqueda: 'huevos',
        cantidad: 10,
        unidadDictada: UnidadMedida.UNIDAD,
      },
    ]);
  });

  it('es insensible a mayúsculas y tildes', () => {
    const items = parseVoiceItemsLocally('QUINCE KILOS DE PAPA CRIOLLA');

    expect(items).toEqual([
      {
        articuloBusqueda: 'papa criolla',
        cantidad: 15,
        unidadDictada: UnidadMedida.KILOGRAMO,
      },
    ]);
  });

  it('parsea correctamente fracciones habladas (medio kilo, dos kilos y medio, libras)', () => {
    const itemsMedio = parseVoiceItemsLocally('medio kilo de papa criolla');
    expect(itemsMedio[0]).toMatchObject({
      articuloBusqueda: 'papa criolla',
      cantidad: 0.5,
      unidadDictada: UnidadMedida.KILOGRAMO,
    });

    const itemsCompuesto = parseVoiceItemsLocally(
      'dos kilos y medio de cebolla',
    );
    expect(itemsCompuesto[0]).toMatchObject({
      articuloBusqueda: 'cebolla',
      cantidad: 2.5,
      unidadDictada: UnidadMedida.KILOGRAMO,
    });

    const itemsLibras = parseVoiceItemsLocally('tres libras de carne');
    expect(itemsLibras[0]).toMatchObject({
      articuloBusqueda: 'carne',
      cantidad: 1.5,
      unidadDictada: UnidadMedida.KILOGRAMO,
    });
  });

  it('devuelve una lista vacía cuando no hay ningún número dictado', () => {
    expect(parseVoiceItemsLocally('papa criolla sin cantidad')).toEqual([]);
    expect(parseVoiceItemsLocally('')).toEqual([]);
  });

  describe('números compuestos en español', () => {
    it.each([
      ['veintidos kilos de papa', 22],
      ['treinta y cinco kilos de papa', 35],
      ['cien kilos de papa', 100],
      ['ciento veinte kilos de papa', 120],
      ['quinientos kilos de papa', 500],
      ['mil kilos de papa', 1000],
      ['dos mil quinientos gramos de papa', 2500],
    ])('"%s" -> cantidad %d', (texto, cantidadEsperada) => {
      const items = parseVoiceItemsLocally(texto);
      expect(items).toHaveLength(1);
      expect(items[0].cantidad).toBe(cantidadEsperada);
    });
  });

  it('reconoce el conector "del" además de "de"', () => {
    const items = parseVoiceItemsLocally('cinco litros del aceite de oliva');

    expect(items).toEqual([
      {
        articuloBusqueda: 'aceite de oliva',
        cantidad: 5,
        unidadDictada: UnidadMedida.LITRO,
      },
    ]);
  });

  it('cada ítem de una lista puede tener o no unidad explícita de forma independiente', () => {
    const items = parseVoiceItemsLocally('diez papas y cinco kilos de cebolla');

    expect(items).toEqual([
      {
        articuloBusqueda: 'papas',
        cantidad: 10,
        unidadDictada: UnidadMedida.UNIDAD,
      },
      {
        articuloBusqueda: 'cebolla',
        cantidad: 5,
        unidadDictada: UnidadMedida.KILOGRAMO,
      },
    ]);
  });

  it('reconoce las 8 unidades de medida soportadas, en singular y plural', () => {
    expect(parseVoiceItemsLocally('1 kilo de sal')[0].unidadDictada).toBe(
      UnidadMedida.KILOGRAMO,
    );
    expect(parseVoiceItemsLocally('1 gramo de sal')[0].unidadDictada).toBe(
      UnidadMedida.GRAMO,
    );
    expect(parseVoiceItemsLocally('1 litro de leche')[0].unidadDictada).toBe(
      UnidadMedida.LITRO,
    );
    expect(
      parseVoiceItemsLocally('1 mililitro de leche')[0].unidadDictada,
    ).toBe(UnidadMedida.MILILITRO);
    expect(
      parseVoiceItemsLocally('1 canastilla de tomate')[0].unidadDictada,
    ).toBe(UnidadMedida.CANASTILLA);
    expect(parseVoiceItemsLocally('1 caja de manzanas')[0].unidadDictada).toBe(
      UnidadMedida.CAJA,
    );
    expect(parseVoiceItemsLocally('1 porcion de arroz')[0].unidadDictada).toBe(
      UnidadMedida.PORCION,
    );
  });

  // La coma se trata como separador de lista (equivalente a "y"), no como
  // separador decimal: es el fallback local sin IA, y el dictado real llega
  // con decimales en punto ("2.5"), no en coma. Se documenta el
  // comportamiento actual para que un cambio futuro en tokenize() sea
  // intencional y no una regresión silenciosa.
  it('trata la coma como separador de lista, no como separador decimal', () => {
    const items = parseVoiceItemsLocally('2,5 kilos de queso');

    expect(items).not.toEqual([
      {
        articuloBusqueda: 'queso',
        cantidad: 2.5,
        unidadDictada: UnidadMedida.KILOGRAMO,
      },
    ]);
  });
});
