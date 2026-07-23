import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Frontera de confianza sistema-a-sistema (el ERP externo llamando a
 * nuestros webhooks de sincronización), distinta de la sesión por operario:
 * no hay un JWT de usuario razonable para un caller que no es una persona.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.headers['x-api-key'];
    const expectedKey = process.env.ERP_WEBHOOK_API_KEY;

    if (!expectedKey) {
      throw new UnauthorizedException(
        'ERP_WEBHOOK_API_KEY no está configurado en el servidor',
      );
    }
    if (providedKey !== expectedKey) {
      throw new UnauthorizedException(
        'API key inválida o ausente (header X-Api-Key)',
      );
    }
    return true;
  }
}
