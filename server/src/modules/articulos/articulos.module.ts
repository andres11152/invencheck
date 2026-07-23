import { Module } from '@nestjs/common';
import { ArticuloController } from './articulo.controller';
import { ArticuloService } from './articulo.service';
import { ArticuloRepository } from './articulo.repository';

@Module({
  controllers: [ArticuloController],
  providers: [ArticuloService, ArticuloRepository],
  exports: [ArticuloService, ArticuloRepository],
})
export class ArticulosModule {}
