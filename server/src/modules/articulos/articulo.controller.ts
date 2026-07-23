import { Controller, Get, Param, Post, Body, Query } from '@nestjs/common';
import { ArticuloService } from './articulo.service';
import { FindArticulosQueryDto } from './dto/find-articulos-query.dto';
import { MatchVoiceDto } from './dto/match-voice.dto';

@Controller('articulos')
export class ArticuloController {
  constructor(private readonly articuloService: ArticuloService) {}

  @Get()
  findAll(@Query() query: FindArticulosQueryDto) {
    return this.articuloService.findAll(query);
  }

  @Post('match-voice')
  matchVoice(@Body() body: MatchVoiceDto) {
    return this.articuloService.normalizarEntradaHablada(body.query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.articuloService.findById(id);
  }
}
