import { Injectable } from '@nestjs/common';
import {
  Articulo,
  TipoAlerta,
  UnidadMedida,
} from '../../../generated/prisma/client';
import {
  factorConversion,
  round2,
} from '../../../common/utils/unit-conversion.util';

/** > +200% o < -80% frente al histórico dispara ANOMALIA_CANTIDAD. */
export const ANOMALIA_VARIACION_MAX = 2.0;
export const ANOMALIA_VARIACION_MIN = -0.8;

export interface AlertaGenerada {
  tipo: TipoAlerta;
  mensaje: string;
}

export interface EvaluacionConteo {
  /** Conteo ya normalizado a `articulo.unidadEstd` cuando la conversión fue posible. */
  conteoFisico: number;
  /** `articulo.unidadEstd` si se pudo convertir; la unidad dictada original si no. */
  unidadUsada: UnidadMedida;
  esAnomalia: boolean;
  alertas: AlertaGenerada[];
}

/**
 * Reglas de negocio para validar una línea de conteo antes de persistirla:
 * variación excesiva vs. histórico, stock negativo heredado del ERP, e
 * inconsistencia/conversión de unidades.
 */
@Injectable()
export class AnomaliasService {
  evaluarConteo(params: {
    articulo: Articulo;
    teorico: number;
    conteoFisico: number;
    unidadDictada: UnidadMedida;
  }): EvaluacionConteo {
    const { articulo, teorico } = params;
    const alertas: AlertaGenerada[] = [];
    let esAnomalia = false;

    // Regla 3: inconsistencia/conversión de unidades.
    let conteoFisico = params.conteoFisico;
    let unidadUsada = params.unidadDictada;
    if (params.unidadDictada !== articulo.unidadEstd) {
      const factor = factorConversion(
        params.unidadDictada,
        articulo.unidadEstd,
      );
      if (factor !== undefined) {
        conteoFisico = round2(conteoFisico * factor);
        unidadUsada = articulo.unidadEstd;
      } else {
        esAnomalia = true;
        alertas.push({
          tipo: TipoAlerta.UNIDAD_AMBIGUA,
          mensaje: `Se dictó en ${params.unidadDictada} pero "${articulo.nombre}" se maneja en ${articulo.unidadEstd}; no hay conversión automática disponible.`,
        });
      }
    }

    // Regla 2: stock negativo heredado del ERP.
    if (teorico < 0) {
      esAnomalia = true;
      alertas.push({
        tipo: TipoAlerta.STOCK_NEGATIVO,
        mensaje: `El teórico del ERP para "${articulo.nombre}" es negativo (${teorico}); indica un descuadre previo a esta toma.`,
      });
    }

    // Regla 1: variación excesiva frente al histórico.
    const avg = articulo.stockHistoricoAvg;
    if (avg !== null && avg > 0) {
      const variacion = (conteoFisico - avg) / avg;
      if (
        variacion > ANOMALIA_VARIACION_MAX ||
        variacion < ANOMALIA_VARIACION_MIN
      ) {
        esAnomalia = true;
        alertas.push({
          tipo: TipoAlerta.ANOMALIA_CANTIDAD,
          mensaje: `Conteo de ${conteoFisico} ${unidadUsada} se desvía ${Math.round(
            variacion * 100,
          )}% del histórico (${avg.toFixed(2)}) para "${articulo.nombre}".`,
        });
      }
    }

    return { conteoFisico, unidadUsada, esAnomalia, alertas };
  }
}
