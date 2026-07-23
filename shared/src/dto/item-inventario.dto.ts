import { UnidadMedida } from '../enums/unidad-medida.enum';
import { ArticuloDto } from './articulo.dto';

/**
 * Línea de conteo dentro de una toma física: compara el valor teórico
 * del ERP/Symphony contra el conteo físico digitado o dictado por voz.
 */
export interface ItemInventarioDto {
  id: string;
  inventarioId: string;
  articuloId: string;
  articulo?: ArticuloDto;
  teorico: number;
  conteoFisico: number;
  unidadUsada: UnidadMedida;
  esAnomalia: boolean;
  createdAt: Date;
  updatedAt: Date;
}
