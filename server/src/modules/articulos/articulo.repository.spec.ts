import { ArticuloRepository } from './articulo.repository';
import type { PrismaService } from '../../prisma/prisma.service';
import { UnidadMedida, type Articulo } from '../../generated/prisma/client';

function buildRow(i: number) {
  return {
    sku: null,
    nombre: `ARTICULO ${i}`,
    aliases: [`articulo ${i}`],
    categoria: 'Test',
    unidadEstd: UnidadMedida.UNIDAD,
    esProcesado: false,
    stockHistoricoAvg: null,
  };
}

/**
 * Regresión de un fallo real en producción: `upsertMany` con las ~938 filas
 * del catálogo real en UNA sola transacción excedía el timeout (120362ms
 * vs. 120000ms, rollback completo) — los 936 artículos quedaban sin
 * importar aunque el import se "corriera" sin errores hasta ese punto. Se
 * partió en lotes de 100 con su propia transacción corta cada uno.
 */
describe('ArticuloRepository.upsertMany — procesamiento por lotes', () => {
  function buildRepository(existentes: Articulo[] = []) {
    const transactionCalls: unknown[][] = [];
    const prisma = {
      articulo: {
        findMany: jest.fn().mockResolvedValue(existentes),
        create: jest.fn((args: unknown) => ({ __op: 'create', args })),
        update: jest.fn((args: unknown) => ({ __op: 'update', args })),
      },
      $transaction: jest.fn((ops: unknown[]) => {
        transactionCalls.push(ops);
        return Promise.resolve(ops);
      }),
    } as unknown as PrismaService;

    return { repository: new ArticuloRepository(prisma), transactionCalls };
  }

  it('con menos de 100 filas hace una sola transacción', async () => {
    const { repository, transactionCalls } = buildRepository();
    const rows = Array.from({ length: 30 }, (_, i) => buildRow(i));

    await repository.upsertMany(rows);

    expect(transactionCalls).toHaveLength(1);
    expect(transactionCalls[0]).toHaveLength(30);
  });

  it('con 250 filas las parte en lotes de 100/100/50, no en una transacción gigante', async () => {
    const { repository, transactionCalls } = buildRepository();
    const rows = Array.from({ length: 250 }, (_, i) => buildRow(i));

    const count = await repository.upsertMany(rows);

    expect(count).toBe(250);
    expect(transactionCalls).toHaveLength(3);
    expect(transactionCalls[0]).toHaveLength(100);
    expect(transactionCalls[1]).toHaveLength(100);
    expect(transactionCalls[2]).toHaveLength(50);
  });

  it('si un lote falla, los lotes anteriores ya se llamaron (no se pierde todo el import)', async () => {
    const transactionMock = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('timeout simulado en el lote 2'));
    const prisma = {
      articulo: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn((args: unknown) => ({ __op: 'create', args })),
        update: jest.fn(),
      },
      $transaction: transactionMock,
    } as unknown as PrismaService;
    const repository = new ArticuloRepository(prisma);
    const rows = Array.from({ length: 150 }, (_, i) => buildRow(i));

    await expect(repository.upsertMany(rows)).rejects.toThrow(
      'timeout simulado en el lote 2',
    );
    expect(transactionMock).toHaveBeenCalledTimes(2);
  });
});
