import { Injectable, NotFoundException } from '@nestjs/common';
import { AlmacenRepository } from '../almacenes/almacen.repository';
import {
  ReporteRepository,
  type VariacionArticuloRow,
} from './reporte.repository';

@Injectable()
export class ReporteService {
  constructor(
    private readonly reporteRepository: ReporteRepository,
    private readonly almacenRepository: AlmacenRepository,
  ) {}

  async variacion(params: {
    almacenId?: string;
    desde?: string;
    hasta?: string;
  }): Promise<VariacionArticuloRow[]> {
    if (params.almacenId) {
      const almacen = await this.almacenRepository.findById(params.almacenId);
      if (!almacen) {
        throw new NotFoundException(
          `Almacén ${params.almacenId} no encontrado`,
        );
      }
    }

    return this.reporteRepository.reporteVariacion({
      almacenId: params.almacenId,
      desde: params.desde ? new Date(params.desde) : undefined,
      hasta: params.hasta ? new Date(params.hasta) : undefined,
    });
  }

  async exportOracleMyInventoryCsv(params: {
    almacenId?: string;
    desde?: string;
    hasta?: string;
  }): Promise<string> {
    const variaciones = await this.variacion(params);
    const headers = [
      'SKU',
      'ARTICULO',
      'CATEGORIA',
      'UNIDAD',
      'TOMAS_FISICAS',
      'CONTEO_PROMEDIO',
      'TEORICO_PROMEDIO',
      'MERMA_TOTAL',
      'ULTIMA_FECHA',
    ].join(',');

    const rows = variaciones.map((row) =>
      [
        `"${row.sku ?? ''}"`,
        `"${row.nombre.replace(/"/g, '""')}"`,
        `"${row.categoria}"`,
        `"${row.unidadEstd}"`,
        row.tomas,
        row.promedioContado,
        row.promedioTeorico,
        row.mermaTotal,
        `"${row.ultimaFecha instanceof Date ? row.ultimaFecha.toISOString() : String(row.ultimaFecha)}"`,
      ].join(','),
    );

    return [headers, ...rows].join('\n');
  }
}
