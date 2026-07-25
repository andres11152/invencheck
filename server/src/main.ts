import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import type { EnvironmentVariables } from './config/env.validation';

async function bootstrap() {
  // Si falta una variable requerida o tiene el tipo equivocado, `AppModule`
  // (vía `ConfigModule.forRoot({ validate })`) lanza acá mismo, antes de que
  // el proceso llegue a escuchar ningún puerto — ver env.validation.ts.
  const app = await NestFactory.create(AppModule);
  const configService: ConfigService<EnvironmentVariables, true> =
    app.get(ConfigService);

  app.setGlobalPrefix('api');
  // CORS_ORIGIN acepta una lista separada por comas para soportar más de un
  // origin de frontend (ej. staging + prod) sin reflejar cualquier origin
  // arbitrario — `origin: true` + `credentials: true` anularía la protección
  // de CORS para requests con el JWT adjunto.
  app.enableCors({
    origin: configService
      .get('CORS_ORIGIN', { infer: true })
      ?.split(',')
      .map((o) => o.trim()) ?? ['http://localhost:3001'],
    credentials: true,
  });
  // `forbidNonWhitelisted`: un campo inesperado en el body (ej. un intento de
  // volver a colar `usuarioId` en un DTO — ver nota de seguridad en el
  // README sobre por qué eso está prohibido) responde 400 de forma ruidosa
  // en vez de descartarse en silencio. Con solo `whitelist: true`, una
  // regresión así pasaría sin que ningún test la note.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(configService.get('PORT', { infer: true }) ?? 3000);
}
void bootstrap();
