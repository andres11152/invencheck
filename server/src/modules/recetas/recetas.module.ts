import { Module } from '@nestjs/common';
import { RecetaController } from './receta.controller';
import { RecetaService } from './receta.service';
import { RecetaRepository } from './receta.repository';
import { AlmacenesModule } from '../almacenes/almacenes.module';

@Module({
  imports: [AlmacenesModule],
  controllers: [RecetaController],
  providers: [RecetaService, RecetaRepository],
  exports: [RecetaService],
})
export class RecetasModule {}
