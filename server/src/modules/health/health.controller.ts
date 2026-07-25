import {
  Controller,
  Get,
  HttpCode,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Liveness + readiness en un solo endpoint: si Postgres no responde, el
 * proceso Node sigue vivo pero no puede servir tráfico real, así que un
 * orquestador (k8s, load balancer) debe tratarlo como no-listo (503).
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  // Un orquestador puede pollear esto cada pocos segundos: no debe competir
  // por el límite global de 60/60s pensado para tráfico de usuarios reales.
  @SkipThrottle()
  @Get()
  @HttpCode(200)
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException(
        'No hay conexión con la base de datos',
      );
    }
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
