import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { ContextoOrganizacionService } from '../../../prisma/contexto-organizacion.service';
import { ORGANIZACION_LEGADO_ID } from '../../../prisma/organizacion-legado';
import type { EnvironmentVariables } from '../../../config/env.validation';

/**
 * Frontera de confianza sistema-a-sistema (el ERP externo llamando a
 * nuestros webhooks de sincronización), distinta de la sesión por operario:
 * no hay un JWT de usuario razonable para un caller que no es una persona.
 *
 * DEUDA CONOCIDA (multi-tenant, pendiente de la Fase 5 del plan SaaS): con
 * una sola `ERP_WEBHOOK_API_KEY` global no hay forma de que esta clave
 * identifique DE QUÉ organización es el ERP que llama — así que, mientras
 * no exista un modelo `ClaveApiOrganizacion` con una clave por cliente, este
 * guard asigna TODA sincronización a la organización de legado
 * (`ORGANIZACION_LEGADO_ID`, la única que existe hoy). Es un stopgap
 * deliberado para no romper la integración ERP real que ya existe, no una
 * solución multi-tenant — un segundo cliente con su propio ERP NO puede
 * usar este endpoint todavía sin pisar el catálogo de la organización de
 * legado.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
    private readonly contexto: ContextoOrganizacionService,
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
    this.contexto.asignar(ORGANIZACION_LEGADO_ID);
    return true;
  }
}
