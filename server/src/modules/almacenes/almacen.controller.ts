import { Controller, Get, Query } from '@nestjs/common';
import { AlmacenService } from './almacen.service';
import { FindAlmacenesQueryDto } from './dto/find-almacenes-query.dto';

@Controller('almacenes')
export class AlmacenController {
  constructor(private readonly almacenService: AlmacenService) {}

  @Get()
  findAll(@Query() query: FindAlmacenesQueryDto) {
    return this.almacenService.findAll(query.unidad);
  }
}
