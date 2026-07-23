import { EstadoInventario } from '../enums/estado-inventario.enum';
import { AlmacenDto } from './almacen.dto';
import { ItemInventarioDto } from './item-inventario.dto';
import { AlertaInventarioDto } from './alerta-inventario.dto';

/**
 * Toma física de un almacén en una fecha de corte. `auditorId` solo se
 * diligencia cuando el inventario entra en auditoría ciega.
 */
export interface InventarioDto {
  id: string;
  almacenId: string;
  almacen?: AlmacenDto;
  usuarioId: string;
  auditorId: string | null;
  estado: EstadoInventario;
  fechaCorte: Date;
  items?: ItemInventarioDto[];
  alertas?: AlertaInventarioDto[];
  createdAt: Date;
  updatedAt: Date;
}
