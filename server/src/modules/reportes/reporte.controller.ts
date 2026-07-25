import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ReporteService } from './reporte.service';
import { VariacionQueryDto } from './dto/variacion-query.dto';

@Controller('reportes')
export class ReporteController {
  constructor(private readonly reporteService: ReporteService) {}

  @Get('variacion')
  variacion(@Query() query: VariacionQueryDto) {
    return this.reporteService.variacion(query);
  }

  @Get('export-oracle-myinventory')
  async exportOracleMyInventory(
    @Query() query: VariacionQueryDto,
    @Res() res: Response,
  ) {
    const csv = await this.reporteService.exportOracleMyInventoryCsv(query);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=oracle-myinventory-export-${Date.now()}.csv`,
    );
    res.status(200).send(csv);
  }
}
