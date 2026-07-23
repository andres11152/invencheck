import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AlmacenRepository } from '../almacenes/almacen.repository';
import { RecetaDetalle, RecetaRepository } from './receta.repository';
import {
  factorConversion,
  round2,
} from '../../common/utils/unit-conversion.util';
import type {
  Articulo,
  Receta,
  UnidadMedida,
} from '../../generated/prisma/client';

export type FuenteDisponible =
  'TOMA_FISICA' | 'PROMEDIO_HISTORICO' | 'SIN_DATO';

export interface InsumoExplosion {
  articulo: Articulo;
  unidad: UnidadMedida;
  necesario: number;
  disponible: number;
  faltante: number;
  fuenteDisponible: FuenteDisponible;
}

export interface ExplosionInsumosResult {
  receta: { id: string; nombre: string; porcionesBase: number };
  porcionesSolicitadas: number;
  almacenId: string | null;
  insumos: InsumoExplosion[];
}

/**
 * Explosión de insumos: "si el chef dice que hoy prepara 50 ajiacos",
 * calcula cuánto de cada insumo hace falta pedir, comparando lo requerido
 * por la receta contra el stock disponible más reciente conocido.
 */
@Injectable()
export class RecetaService {
  constructor(
    private readonly recetaRepository: RecetaRepository,
    private readonly almacenRepository: AlmacenRepository,
  ) {}

  findAll(): Promise<Receta[]> {
    return this.recetaRepository.findAll();
  }

  async findDetalle(id: string): Promise<RecetaDetalle> {
    const receta = await this.recetaRepository.findDetalleById(id);
    if (!receta) {
      throw new NotFoundException(`Receta ${id} no encontrada`);
    }
    return receta;
  }

  async explosionInsumos(
    recetaId: string,
    porciones: number,
    almacenId?: string,
  ): Promise<ExplosionInsumosResult> {
    if (porciones <= 0) {
      throw new BadRequestException('Las porciones deben ser mayores a 0');
    }

    const receta = await this.findDetalle(recetaId);

    if (almacenId) {
      const almacen = await this.almacenRepository.findById(almacenId);
      if (!almacen) {
        throw new NotFoundException(`Almacén ${almacenId} no encontrado`);
      }
    }

    const insumos: InsumoExplosion[] = [];
    for (const recetaItem of receta.items) {
      const necesario = round2(recetaItem.cantidadPorPorcion * porciones);
      const { disponible, fuenteDisponible } = await this.resolverDisponible(
        recetaItem.articuloId,
        recetaItem.unidad,
        recetaItem.articulo,
        almacenId,
      );

      insumos.push({
        articulo: recetaItem.articulo,
        unidad: recetaItem.unidad,
        necesario,
        disponible,
        faltante: round2(Math.max(0, necesario - disponible)),
        fuenteDisponible,
      });
    }

    return {
      receta: {
        id: receta.id,
        nombre: receta.nombre,
        porcionesBase: receta.porciones,
      },
      porcionesSolicitadas: porciones,
      almacenId: almacenId ?? null,
      insumos,
    };
  }

  /**
   * Prioriza la última toma física real (más precisa y reciente); si no hay
   * ninguna, cae al promedio histórico del artículo. Sin integración ERP en
   * vivo, no hay una tercera fuente mejor disponible.
   */
  private async resolverDisponible(
    articuloId: string,
    unidadReceta: UnidadMedida,
    articulo: Articulo,
    almacenId?: string,
  ): Promise<{ disponible: number; fuenteDisponible: FuenteDisponible }> {
    const stock = await this.recetaRepository.stockActualPorArticulo(
      articuloId,
      almacenId,
    );
    if (stock) {
      const factor = factorConversion(stock.unidadUsada, unidadReceta);
      if (factor !== undefined) {
        return {
          disponible: round2(stock.conteoFisico * factor),
          fuenteDisponible: 'TOMA_FISICA',
        };
      }
    }

    if (articulo.stockHistoricoAvg !== null) {
      const factor = factorConversion(articulo.unidadEstd, unidadReceta);
      if (factor !== undefined) {
        return {
          disponible: round2(articulo.stockHistoricoAvg * factor),
          fuenteDisponible: 'PROMEDIO_HISTORICO',
        };
      }
    }

    return { disponible: 0, fuenteDisponible: 'SIN_DATO' };
  }
}
