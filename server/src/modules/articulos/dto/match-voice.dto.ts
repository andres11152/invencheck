import { IsNotEmpty, IsString } from 'class-validator';

export class MatchVoiceDto {
  @IsString()
  @IsNotEmpty()
  query!: string;
}
