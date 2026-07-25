import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { UnidadMedida } from '../../../generated/prisma/client';

export class ProcesarSkuDto {
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @IsNumber()
  @IsPositive()
  cantidad!: number;

  @IsOptional()
  @IsEnum(UnidadMedida)
  unidadDictada?: UnidadMedida;
}
