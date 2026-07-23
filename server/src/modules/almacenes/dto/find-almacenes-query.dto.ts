import { IsOptional, IsString } from 'class-validator';

export class FindAlmacenesQueryDto {
  @IsOptional()
  @IsString()
  unidad?: string;
}
