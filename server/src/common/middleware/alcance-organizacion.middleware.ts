import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ContextoOrganizacionService } from '../../prisma/contexto-organizacion.service';

/**
 * Abre un alcance de organización VACÍO para cada request, que
 * `JwtStrategy.validate` (o `ApiKeyGuard`, para los webhooks del ERP)
 * completa después con la organización real.
 *
 * Tiene que ser un MIDDLEWARE y no un interceptor. Un interceptor devuelve
 * un Observable, y Nest lo suscribe FUERA del `als.run()` — el handler
 * terminaría corriendo sin contexto. Un middleware, en cambio, llama a
 * `next()` de forma síncrona dentro del `run()`, y Express ejecuta el resto
 * de la cadena (guards, pipes, handler y todo lo que se await-ee después)
 * heredando ese contexto.
 */
@Injectable()
export class AlcanceOrganizacionMiddleware implements NestMiddleware {
  constructor(private readonly contexto: ContextoOrganizacionService) {}

  use(_req: Request, _res: Response, next: NextFunction): void {
    this.contexto.ejecutar({}, () => next());
  }
}
