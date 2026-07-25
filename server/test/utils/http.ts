import request from 'supertest';
import type { INestApplication } from '@nestjs/common';

/**
 * `INestApplication.getHttpServer()` está tipado `any` en `@nestjs/common`,
 * lo que dispara `no-unsafe-argument` en cada llamada a `request(...)`. Este
 * wrapper centraliza el único `as` necesario para pasar el chequeo estricto
 * del proyecto sin repetirlo en cada spec.
 */
export function agent(app: INestApplication) {
  return request(app.getHttpServer() as Parameters<typeof request>[0]);
}
