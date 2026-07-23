import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CrearInventarioDto {
  @IsString()
  @IsNotEmpty()
  almacenId!: string;

  @IsOptional()
  @IsDateString()
  fechaCorte?: string;
}
