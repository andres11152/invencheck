import { Module } from '@nestjs/common';
import { InventarioController } from './inventario.controller';
import { InventarioService } from './inventario.service';
import { InventarioRepositoryModule } from './inventario-repository.module';
import { AnomaliasService } from './services/anomalias.service';
import { AlmacenesModule } from '../almacenes/almacenes.module';
import { ArticulosModule } from '../articulos/articulos.module';
import { AiEngineModule } from '../ai-engine/ai-engine.module';
import { IntegrationModule } from '../integration/integration.module';

@Module({
  imports: [
    InventarioRepositoryModule,
    AlmacenesModule,
    ArticulosModule,
    AiEngineModule,
    IntegrationModule,
  ],
  controllers: [InventarioController],
  providers: [InventarioService, AnomaliasService],
  exports: [InventarioService, InventarioRepositoryModule],
})
export class InventariosModule {}
