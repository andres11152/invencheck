import { Module } from '@nestjs/common';
import { IntegrationController } from './integration.controller';
import { IntegrationErpService } from './integration-erp.service';
import { ArticulosModule } from '../articulos/articulos.module';
import { AlmacenesModule } from '../almacenes/almacenes.module';
import { InventarioRepositoryModule } from '../inventarios/inventario-repository.module';

@Module({
  imports: [ArticulosModule, AlmacenesModule, InventarioRepositoryModule],
  controllers: [IntegrationController],
  providers: [IntegrationErpService],
  exports: [IntegrationErpService],
})
export class IntegrationModule {}
