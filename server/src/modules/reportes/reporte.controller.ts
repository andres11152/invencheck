import { Controller, Get, Query } from '@nestjs/common';
import { ReporteService } from './reporte.service';
import { VariacionQueryDto } from './dto/variacion-query.dto';

@Controller('reportes')
export class ReporteController {
  constructor(private readonly reporteService: ReporteService) {}

  @Get('variacion')
  variacion(@Query() query: VariacionQueryDto) {
    return this.reporteService.variacion(query);
  }
}
