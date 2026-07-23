import { Module } from '@nestjs/common';
import { ReporteController } from './reporte.controller';
import { ReporteService } from './reporte.service';
import { ReporteRepository } from './reporte.repository';
import { AlmacenesModule } from '../almacenes/almacenes.module';

@Module({
  imports: [AlmacenesModule],
  controllers: [ReporteController],
  providers: [ReporteService, ReporteRepository],
})
export class ReportesModule {}
