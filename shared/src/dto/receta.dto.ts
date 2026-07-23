import { RecetaItemDto } from './receta-item.dto';

/**
 * Menú estándar (ej. "Ajiaco Santafereño x 50 porciones") usado para
 * la explosión de insumos: a partir de las porciones vendidas se
 * calcula el consumo teórico de cada artículo.
 */
export interface RecetaDto {
  id: string;
  nombre: string;
  porciones: number;
  items?: RecetaItemDto[];
  createdAt: Date;
  updatedAt: Date;
}
