import {
  AnomaliasService,
  ANOMALIA_VARIACION_MAX,
  ANOMALIA_VARIACION_MIN,
} from './anomalias.service';
import {
  Articulo,
  TipoAlerta,
  UnidadMedida,
} from '../../../generated/prisma/client';

function crearArticulo(overrides: Partial<Articulo> = {}): Articulo {
  return {
    id: 'articulo-1',
    sku: 'SKU-1',
    nombre: 'PAPA CRIOLLA',
    aliases: [],
    categoria: 'AYB',
    unidadEstd: UnidadMedida.KILOGRAMO,
    esProcesado: false,
    stockHistoricoAvg: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AnomaliasService', () => {
  let service: AnomaliasService;

  beforeEach(() => {
    service = new AnomaliasService();
  });

  describe('conteo normal (sin anomalías)', () => {
    it('no genera alertas cuando el conteo está dentro de rango y la unidad coincide', () => {
      const resultado = service.evaluarConteo({
        articulo: crearArticulo({ stockHistoricoAvg: 100 }),
        teorico: 100,
        conteoFisico: 105,
        unidadDictada: UnidadMedida.KILOGRAMO,
      });

      expect(resultado.esAnomalia).toBe(false);
      expect(resultado.alertas).toHaveLength(0);
      expect(resultado.conteoFisico).toBe(105);
      expect(resultado.unidadUsada).toBe(UnidadMedida.KILOGRAMO);
    });
  });

  describe('regla de conversión de unidades', () => {
    it('convierte automáticamente cuando hay un factor conocido (GRAMO -> KILOGRAMO)', () => {
      const resultado = service.evaluarConteo({
        articulo: crearArticulo({
          unidadEstd: UnidadMedida.KILOGRAMO,
          stockHistoricoAvg: null,
        }),
        teorico: 1,
        conteoFisico: 1500,
        unidadDictada: UnidadMedida.GRAMO,
      });

      expect(resultado.esAnomalia).toBe(false);
      expect(resultado.unidadUsada).toBe(UnidadMedida.KILOGRAMO);
      expect(resultado.conteoFisico).toBe(1.5);
    });

    it('redondea a 2 decimales tras la conversión', () => {
      const resultado = service.evaluarConteo({
        articulo: crearArticulo({
          unidadEstd: UnidadMedida.LITRO,
          stockHistoricoAvg: null,
        }),
        teorico: 1,
        conteoFisico: 333,
        unidadDictada: UnidadMedida.MILILITRO,
      });

      expect(resultado.conteoFisico).toBe(0.33);
    });

    it('marca UNIDAD_AMBIGUA y NO convierte cuando no hay factor conocido entre las unidades', () => {
      const resultado = service.evaluarConteo({
        articulo: crearArticulo({
          unidadEstd: UnidadMedida.KILOGRAMO,
          stockHistoricoAvg: null,
        }),
        teorico: 10,
        conteoFisico: 7,
        unidadDictada: UnidadMedida.UNIDAD,
      });

      expect(resultado.esAnomalia).toBe(true);
      expect(resultado.alertas).toEqual([
        expect.objectContaining({ tipo: TipoAlerta.UNIDAD_AMBIGUA }),
      ]);
      // No se convierte: el conteo y la unidad dictada quedan tal cual llegaron.
      expect(resultado.conteoFisico).toBe(7);
      expect(resultado.unidadUsada).toBe(UnidadMedida.UNIDAD);
    });

    it('no evalúa conversión cuando la unidad dictada ya coincide con la del artículo', () => {
      const resultado = service.evaluarConteo({
        articulo: crearArticulo({
          unidadEstd: UnidadMedida.UNIDAD,
          stockHistoricoAvg: null,
        }),
        teorico: 10,
        conteoFisico: 12,
        unidadDictada: UnidadMedida.UNIDAD,
      });

      expect(resultado.esAnomalia).toBe(false);
      expect(resultado.unidadUsada).toBe(UnidadMedida.UNIDAD);
    });
  });

  describe('regla de stock negativo', () => {
    it('marca STOCK_NEGATIVO cuando el teórico heredado del ERP es negativo', () => {
      const resultado = service.evaluarConteo({
        articulo: crearArticulo({ stockHistoricoAvg: null }),
        teorico: -5,
        conteoFisico: 10,
        unidadDictada: UnidadMedida.KILOGRAMO,
      });

      expect(resultado.esAnomalia).toBe(true);
      expect(resultado.alertas).toEqual([
        expect.objectContaining({ tipo: TipoAlerta.STOCK_NEGATIVO }),
      ]);
    });

    it('no marca STOCK_NEGATIVO cuando el teórico es exactamente 0', () => {
      const resultado = service.evaluarConteo({
        articulo: crearArticulo({ stockHistoricoAvg: null }),
        teorico: 0,
        conteoFisico: 10,
        unidadDictada: UnidadMedida.KILOGRAMO,
      });

      expect(resultado.esAnomalia).toBe(false);
    });
  });

  describe('regla de variación excesiva vs. histórico', () => {
    it('marca ANOMALIA_CANTIDAD cuando la variación supera el máximo (+200%)', () => {
      const resultado = service.evaluarConteo({
        articulo: crearArticulo({ stockHistoricoAvg: 100 }),
        teorico: 100,
        // variación = (301 - 100) / 100 = 2.01 > ANOMALIA_VARIACION_MAX (2.0)
        conteoFisico: 301,
        unidadDictada: UnidadMedida.KILOGRAMO,
      });

      expect(resultado.esAnomalia).toBe(true);
      expect(resultado.alertas).toEqual([
        expect.objectContaining({ tipo: TipoAlerta.ANOMALIA_CANTIDAD }),
      ]);
    });

    it('marca ANOMALIA_CANTIDAD cuando la variación cae por debajo del mínimo (-80%)', () => {
      const resultado = service.evaluarConteo({
        articulo: crearArticulo({ stockHistoricoAvg: 100 }),
        teorico: 100,
        // variación = (19 - 100) / 100 = -0.81 < ANOMALIA_VARIACION_MIN (-0.8)
        conteoFisico: 19,
        unidadDictada: UnidadMedida.KILOGRAMO,
      });

      expect(resultado.esAnomalia).toBe(true);
      expect(resultado.alertas).toEqual([
        expect.objectContaining({ tipo: TipoAlerta.ANOMALIA_CANTIDAD }),
      ]);
    });

    it('NO marca anomalía justo en el límite superior (variación == +200%)', () => {
      const resultado = service.evaluarConteo({
        articulo: crearArticulo({ stockHistoricoAvg: 100 }),
        teorico: 100,
        // variación = (300 - 100) / 100 = 2.0 == ANOMALIA_VARIACION_MAX (condición es estrictamente >)
        conteoFisico: 100 * (1 + ANOMALIA_VARIACION_MAX),
        unidadDictada: UnidadMedida.KILOGRAMO,
      });

      expect(resultado.esAnomalia).toBe(false);
      expect(resultado.alertas).toHaveLength(0);
    });

    it('NO marca anomalía justo en el límite inferior (variación == -80%)', () => {
      const resultado = service.evaluarConteo({
        articulo: crearArticulo({ stockHistoricoAvg: 100 }),
        teorico: 100,
        conteoFisico: 100 * (1 + ANOMALIA_VARIACION_MIN),
        unidadDictada: UnidadMedida.KILOGRAMO,
      });

      expect(resultado.esAnomalia).toBe(false);
      expect(resultado.alertas).toHaveLength(0);
    });

    it('no evalúa la regla cuando no hay histórico (stockHistoricoAvg es null)', () => {
      const resultado = service.evaluarConteo({
        articulo: crearArticulo({ stockHistoricoAvg: null }),
        teorico: 100,
        conteoFisico: 999999,
        unidadDictada: UnidadMedida.KILOGRAMO,
      });

      expect(resultado.esAnomalia).toBe(false);
      expect(resultado.alertas).toHaveLength(0);
    });

    it('no evalúa la regla cuando el histórico es 0 (evita división por cero)', () => {
      const resultado = service.evaluarConteo({
        articulo: crearArticulo({ stockHistoricoAvg: 0 }),
        teorico: 100,
        conteoFisico: 999999,
        unidadDictada: UnidadMedida.KILOGRAMO,
      });

      expect(resultado.esAnomalia).toBe(false);
      expect(resultado.alertas).toHaveLength(0);
    });
  });

  describe('promedioHistoricoBodega tiene prioridad sobre el promedio global', () => {
    it('usa el promedio de la bodega en vez del global cuando ambos están presentes', () => {
      // Global dice 100 (conteo de 105 sería normal contra eso), pero esta
      // bodega normalmente tiene 9 — 105 contra 9 es una desviación enorme.
      const resultado = service.evaluarConteo({
        articulo: crearArticulo({ stockHistoricoAvg: 100 }),
        teorico: 9,
        conteoFisico: 90,
        unidadDictada: UnidadMedida.KILOGRAMO,
        promedioHistoricoBodega: 9,
      });

      expect(resultado.esAnomalia).toBe(true);
      expect(resultado.alertas).toEqual([
        expect.objectContaining({ tipo: TipoAlerta.ANOMALIA_CANTIDAD }),
      ]);
      expect(resultado.alertas[0].mensaje).toContain('de esta bodega');
    });

    it('NO marca anomalía si el conteo es normal para el promedio de la bodega, aunque se desvíe del global', () => {
      // Global dice 100 -> 9 sería -91%, anómalo contra el global. Pero
      // esta bodega normalmente tiene 9 -> 9 es exactamente su promedio.
      const resultado = service.evaluarConteo({
        articulo: crearArticulo({ stockHistoricoAvg: 100 }),
        teorico: 9,
        conteoFisico: 9,
        unidadDictada: UnidadMedida.KILOGRAMO,
        promedioHistoricoBodega: 9,
      });

      expect(resultado.esAnomalia).toBe(false);
      expect(resultado.alertas).toHaveLength(0);
    });

    it('cae al promedio global cuando la bodega no tiene historial propio (null)', () => {
      const resultado = service.evaluarConteo({
        articulo: crearArticulo({ stockHistoricoAvg: 100 }),
        teorico: 100,
        conteoFisico: 301, // variación = 2.01 > +200% contra el global (100)
        unidadDictada: UnidadMedida.KILOGRAMO,
        promedioHistoricoBodega: null,
      });

      expect(resultado.esAnomalia).toBe(true);
      expect(resultado.alertas).toEqual([
        expect.objectContaining({ tipo: TipoAlerta.ANOMALIA_CANTIDAD }),
      ]);
      expect(resultado.alertas[0].mensaje).toContain(
        'histórico general del catálogo',
      );
    });

    it('cae al promedio global cuando no se pasa promedioHistoricoBodega (compatibilidad hacia atrás)', () => {
      const resultado = service.evaluarConteo({
        articulo: crearArticulo({ stockHistoricoAvg: 100 }),
        teorico: 100,
        conteoFisico: 301,
        unidadDictada: UnidadMedida.KILOGRAMO,
      });

      expect(resultado.esAnomalia).toBe(true);
      expect(resultado.alertas[0].mensaje).toContain(
        'histórico general del catálogo',
      );
    });
  });

  describe('combinación de reglas', () => {
    it('puede disparar STOCK_NEGATIVO y ANOMALIA_CANTIDAD a la vez', () => {
      const resultado = service.evaluarConteo({
        articulo: crearArticulo({ stockHistoricoAvg: 100 }),
        teorico: -10, // dispara STOCK_NEGATIVO
        conteoFisico: 500, // dispara ANOMALIA_CANTIDAD (variación = 4.0)
        unidadDictada: UnidadMedida.KILOGRAMO,
      });

      expect(resultado.esAnomalia).toBe(true);
      const tipos = resultado.alertas.map((a) => a.tipo);
      expect(tipos).toEqual(
        expect.arrayContaining([
          TipoAlerta.STOCK_NEGATIVO,
          TipoAlerta.ANOMALIA_CANTIDAD,
        ]),
      );
      expect(resultado.alertas).toHaveLength(2);
    });

    it('la variación excesiva se evalúa sobre el conteo YA convertido de unidad', () => {
      // Dictado en gramos, artículo en kilogramos: 150000 g -> 150 kg.
      // Histórico 100 kg -> variación = (150-100)/100 = 0.5, dentro de rango: sin anomalía.
      const resultado = service.evaluarConteo({
        articulo: crearArticulo({
          unidadEstd: UnidadMedida.KILOGRAMO,
          stockHistoricoAvg: 100,
        }),
        teorico: 100,
        conteoFisico: 150000,
        unidadDictada: UnidadMedida.GRAMO,
      });

      expect(resultado.conteoFisico).toBe(150);
      expect(resultado.esAnomalia).toBe(false);
    });
  });
});
