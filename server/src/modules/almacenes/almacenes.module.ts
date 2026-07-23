import { Module } from '@nestjs/common';
import { AlmacenController } from './almacen.controller';
import { AlmacenService } from './almacen.service';
import { AlmacenRepository } from './almacen.repository';

@Module({
  controllers: [AlmacenController],
  providers: [AlmacenService, AlmacenRepository],
  exports: [AlmacenService, AlmacenRepository],
})
export class AlmacenesModule {}
