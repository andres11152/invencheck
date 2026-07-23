import { UnidadMedida } from '../enums/unidad-medida.enum';
import { ArticuloDto } from './articulo.dto';

/** Insumo requerido por porción dentro de una receta. */
export interface RecetaItemDto {
  id: string;
  recetaId: string;
  articuloId: string;
  articulo?: ArticuloDto;
  cantidadPorPorcion: number;
  unidad: UnidadMedida;
}
