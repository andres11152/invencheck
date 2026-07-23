import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { UnidadMedida } from '../../../generated/prisma/client';

/** Una línea del catálogo maestro tal como la envía el ERP externo. */
export class SyncArticuloItemDto {
  @IsOptional()
  @IsString()
  sku?: string;

  @IsString()
  nombre!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aliases?: string[];

  @IsString()
  categoria!: string;

  @IsEnum(UnidadMedida)
  unidadEstd!: UnidadMedida;

  @IsOptional()
  @IsBoolean()
  esProcesado?: boolean;

  @IsOptional()
  @IsNumber()
  stockHistoricoAvg?: number;
}
