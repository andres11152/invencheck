import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { UnidadMedida } from '../../../generated/prisma/client';

export class ProcesarArticuloDto {
  @IsString()
  @IsNotEmpty()
  articuloId!: string;

  @IsNumber()
  @IsPositive()
  cantidad!: number;

  @IsOptional()
  @IsEnum(UnidadMedida)
  unidadDictada?: UnidadMedida;
}
