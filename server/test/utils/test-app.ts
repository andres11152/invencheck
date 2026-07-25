import './env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../../src/prisma/prisma.service';

export interface TestAppContext {
  app: INestApplication;
  prisma: PrismaService;
}

/** Reproduce el bootstrap real de `src/main.ts` (prefijo, pipes, filtro) contra un módulo Nest real. */
export async function createTestApp(): Promise<TestAppContext> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  const prisma = moduleRef.get(PrismaService);
  return { app, prisma };
}

export async function closeTestApp(ctx: TestAppContext): Promise<void> {
  await ctx.app.close();
}
