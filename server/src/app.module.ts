import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AlmacenesModule } from './modules/almacenes/almacenes.module';
import { ArticulosModule } from './modules/articulos/articulos.module';
import { AiEngineModule } from './modules/ai-engine/ai-engine.module';
import { InventariosModule } from './modules/inventarios/inventarios.module';
import { RecetasModule } from './modules/recetas/recetas.module';
import { ReportesModule } from './modules/reportes/reportes.module';
import { IntegrationModule } from './modules/integration/integration.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AlmacenesModule,
    ArticulosModule,
    AiEngineModule,
    InventariosModule,
    RecetasModule,
    ReportesModule,
    IntegrationModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
