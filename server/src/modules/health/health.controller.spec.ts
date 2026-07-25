import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import type { PrismaService } from '../../prisma/prisma.service';

describe('HealthController.check', () => {
  function buildController($queryRaw: jest.Mock) {
    const prisma = { $queryRaw } as unknown as PrismaService;
    return new HealthController(prisma);
  }

  it('devuelve status ok cuando la base de datos responde', async () => {
    const controller = buildController(jest.fn().mockResolvedValue([{ '?column?': 1 }]));

    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.timestamp).toEqual(expect.any(String));
  });

  it('lanza 503 si la base de datos no responde', async () => {
    const controller = buildController(jest.fn().mockRejectedValue(new Error('conexión caída')));

    await expect(controller.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
