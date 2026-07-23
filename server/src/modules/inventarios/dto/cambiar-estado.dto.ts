import { IsEnum } from 'class-validator';
import { EstadoInventario } from '../../../generated/prisma/client';

export class CambiarEstadoDto {
  @IsEnum(EstadoInventario)
  estado!: EstadoInventario;
}
