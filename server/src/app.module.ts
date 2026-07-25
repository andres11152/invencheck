import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { AlmacenesModule } from './modules/almacenes/almacenes.module';
import { ArticulosModule } from './modules/articulos/articulos.module';
import { AiEngineModule } from './modules/ai-engine/ai-engine.module';
import { InventariosModule } from './modules/inventarios/inventarios.module';
import { ReportesModule } from './modules/reportes/reportes.module';
import { IntegrationModule } from './modules/integration/integration.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';

@Module({
  imports: [
    // Global: ConfigService queda disponible en cualquier módulo sin tener
    // que reimportar ConfigModule en cada uno. `validate` corre una sola vez
    // acá, al arrancar — si falta algo requerido o tiene el tipo equivocado,
    // la app ni siquiera termina de bootstrapear (ver env.validation.ts).
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: validateEnv,
    }),
    // Límite global por defecto (por IP): generoso para no estorbar el uso
    // normal de la app (dictado + polling), pero cierra el abuso anónimo de
    // fuerza bruta. Rutas individuales pueden sobreescribirlo con @Throttle().
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    PrismaModule,
    AuthModule,
    HealthModule,
    AlmacenesModule,
    ArticulosModule,
    AiEngineModule,
    InventariosModule,
    ReportesModule,
    IntegrationModule,
  ],
  providers: [
    // Orden importa: JwtAuthGuard puebla request.user antes de que
    // RolesGuard lo lea. Nest ejecuta los APP_GUARD en el orden declarado.
    // ThrottlerGuard va primero para limitar intentos incluso en rutas
    // @Public() (como /auth/login) antes de que se evalúe nada más.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
