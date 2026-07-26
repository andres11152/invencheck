import { IsEnum, IsNumber, IsPositive } from 'class-validator';
import { UnidadMedida } from '../../../generated/prisma/client';

export class DeshacerConteoDto {
  @IsNumber()
  @IsPositive()
  cantidadDictada!: number;

  @IsEnum(UnidadMedida)
  unidadDictada!: UnidadMedida;
}
