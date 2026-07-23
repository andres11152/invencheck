/**
 * Bodega o punto de consumo físico (ej. "Bodega Principal Piscilago",
 * "Restaurante Fuentes AYB"). `unidad` agrupa por unidad de negocio
 * (ej. "Piscilago", "Hoteles") tal como aparece en BODEGAS Y STOCK.xlsx.
 */
export interface AlmacenDto {
  id: string;
  codigo: string;
  nombre: string;
  unidad: string;
  createdAt: Date;
  updatedAt: Date;
}
