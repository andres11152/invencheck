import { UnidadMedida } from '../enums/unidad-medida.enum';

/**
 * SKU es opcional: ~260 ítems de la data real de Colsubsidio no tienen
 * código y se identifican solo por nombre. `aliases` soporta las
 * variaciones habladas que reconoce la IA de voz (ej. "cerveza heineken
 * cero" -> "CERVEZA HEINEKEN CERO"). `esProcesado` marca los ítems con
 * etiqueta (PA) de cocina (preparación previa).
 */
export interface ArticuloDto {
  id: string;
  sku: string | null;
  nombre: string;
  aliases: string[];
  categoria: string;
  unidadEstd: UnidadMedida;
  esProcesado: boolean;
  stockHistoricoAvg: number | null;
  createdAt: Date;
  updatedAt: Date;
}
