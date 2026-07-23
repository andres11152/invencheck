import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ExplosionInsumosDto {
  /** Porciones que el chef va a preparar hoy (no tiene por qué ser la base de la receta). */
  @IsNumber()
  @Min(0.1)
  porciones!: number;

  /** Si se indica, compara contra la última toma física de esa bodega. */
  @IsOptional()
  @IsString()
  almacenId?: string;
}
