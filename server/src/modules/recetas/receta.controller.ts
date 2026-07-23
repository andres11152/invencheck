import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RecetaService } from './receta.service';
import { ExplosionInsumosDto } from './dto/explosion-insumos.dto';

@Controller('recetas')
export class RecetaController {
  constructor(private readonly recetaService: RecetaService) {}

  @Get()
  findAll() {
    return this.recetaService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.recetaService.findDetalle(id);
  }

  @Post(':id/explosion')
  explosion(@Param('id') id: string, @Body() dto: ExplosionInsumosDto) {
    return this.recetaService.explosionInsumos(
      id,
      dto.porciones,
      dto.almacenId,
    );
  }
}
