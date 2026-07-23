/**
 * Ciclo de vida de una toma física (Inventario), desde que el operador
 * empieza a contar hasta que la conciliación se envía al ERP (Symphony).
 */
export enum EstadoInventario {
  BORRADOR = 'BORRADOR',
  EN_AUDITORIA = 'EN_AUDITORIA',
  CONCILIADO = 'CONCILIADO',
  ENVIADO_ERP = 'ENVIADO_ERP',
}
