import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { EnvironmentVariables } from '../../../config/env.validation';

/**
 * Frontera de confianza sistema-a-sistema (el ERP externo llamando a
 * nuestros webhooks de sincronización), distinta de la sesión por operario:
 * no hay un JWT de usuario razonable para un caller que no es una persona.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.headers['x-api-key'];
    // ERP_WEBHOOK_API_KEY es requerida en EnvironmentVariables — si faltara,
    // la app no habría llegado a arrancar (ver env.validation.ts), así que
    // acá siempre hay un valor con el que comparar.
    const expectedKey = this.configService.get('ERP_WEBHOOK_API_KEY', {
      infer: true,
    });

    if (providedKey !== expectedKey) {
      throw new UnauthorizedException(
        'API key inválida o ausente (header X-Api-Key)',
      );
    }
    return true;
  }
}
