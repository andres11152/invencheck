import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class VariacionQueryDto {
  @IsOptional()
  @IsString()
  almacenId?: string;

  @IsOptional()
  @IsISO8601()
  desde?: string;

  @IsOptional()
  @IsISO8601()
  hasta?: string;
}
