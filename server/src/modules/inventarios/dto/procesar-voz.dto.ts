import { IsNotEmpty, IsString } from 'class-validator';

export class ProcesarVozDto {
  @IsString()
  @IsNotEmpty()
  texto!: string;
}
