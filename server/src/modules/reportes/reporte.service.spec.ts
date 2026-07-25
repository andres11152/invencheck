import { NotFoundException } from '@nestjs/common';
import { ReporteService } from './reporte.service';
import type {
  ReporteRepository,
  VariacionArticuloRow,
} from './reporte.repository';
import type { AlmacenRepository } from '../almacenes/almacen.repository';
import { UnidadMedida } from '../../generated/prisma/client';

function buildFila(
  overrides: Partial<VariacionArticuloRow> = {},
): VariacionArticuloRow {
  return {
    articuloId: 'art-1',
    sku: '123',
    nombre: 'PAPA CRIOLLA',
    categoria: 'Verduras',
    unidadEstd: UnidadMedida.KILOGRAMO,
    tomas: 3,
    anomalias: 1,
    promedioTeorico: 10,
    promedioContado: 12,
    mermaTotal: 6,
    mermaPromedio: 2,
    ultimaFecha: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('ReporteService', () => {
  function buildService(opts: {
    reporteVariacion?: jest.Mock;
    findById?: jest.Mock;
  }) {
    const reporteRepository = {
      reporteVariacion:
        opts.reporteVariacion ?? jest.fn().mockResolvedValue([]),
    } as unknown as ReporteRepository;
    const almacenRepository = {
      findById: opts.findById ?? jest.fn().mockResolvedValue({ id: 'alm-1' }),
    } as unknown as AlmacenRepository;
    return new ReporteService(reporteRepository, almacenRepository);
  }

  describe('variacion', () => {
    it('lanza 404 si se filtra por un almacenId que no existe', async () => {
      const service = buildService({
        findById: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.variacion({ almacenId: 'no-existe' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('no consulta el almacén si no se filtra por almacenId', async () => {
      const findById = jest.fn();
      const service = buildService({ findById });

      await service.variacion({});

      expect(findById).not.toHaveBeenCalled();
    });

    it('convierte desde/hasta de string ISO a Date antes de delegar al repositorio', async () => {
      const reporteVariacion = jest.fn().mockResolvedValue([]);
      const service = buildService({ reporteVariacion });

      await service.variacion({ desde: '2026-01-01', hasta: '2026-01-31' });

      expect(reporteVariacion).toHaveBeenCalledWith({
        almacenId: undefined,
        desde: new Date('2026-01-01'),
        hasta: new Date('2026-01-31'),
      });
    });
  });

  describe('exportOracleMyInventoryCsv', () => {
    it('genera un CSV con headers fijos y una fila por artículo', async () => {
      const fila = buildFila();
      const service = buildService({
        reporteVariacion: jest.fn().mockResolvedValue([fila]),
      });

      const csv = await service.exportOracleMyInventoryCsv({});
      const [headerLine, dataLine] = csv.split('\n');

      expect(headerLine).toBe(
        'SKU,ARTICULO,CATEGORIA,UNIDAD,TOMAS_FISICAS,CONTEO_PROMEDIO,TEORICO_PROMEDIO,MERMA_TOTAL,ULTIMA_FECHA',
      );
      expect(dataLine).toBe(
        '"123","PAPA CRIOLLA","Verduras","KILOGRAMO",3,12,10,6,"2026-07-01T00:00:00.000Z"',
      );
    });

    it('escapa comillas dobles en el nombre del artículo', async () => {
      const fila = buildFila({ nombre: 'QUESO "DOBLE CREMA" 250G' });
      const service = buildService({
        reporteVariacion: jest.fn().mockResolvedValue([fila]),
      });

      const csv = await service.exportOracleMyInventoryCsv({});

      expect(csv).toContain('"QUESO ""DOBLE CREMA"" 250G"');
    });

    it('usa string vacío cuando el artículo no tiene SKU', async () => {
      const fila = buildFila({ sku: null });
      const service = buildService({
        reporteVariacion: jest.fn().mockResolvedValue([fila]),
      });

      const csv = await service.exportOracleMyInventoryCsv({});

      expect(csv.split('\n')[1].startsWith('"",')).toBe(true);
    });
  });
});
