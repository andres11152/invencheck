import { IsNotEmpty, IsString } from 'class-validator';

/** Una bodega tal como la envía el ERP externo. */
export class SyncAlmacenItemDto {
  @IsString()
  @IsNotEmpty()
  codigo!: string;

  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @IsString()
  @IsNotEmpty()
  unidad!: string;
}
