import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, type UnidadMedida } from '../../generated/prisma/client';

export interface VariacionArticuloRow {
  articuloId: string;
  sku: string | null;
  nombre: string;
  categoria: string;
  unidadEstd: UnidadMedida;
  tomas: number;
  anomalias: number;
  promedioTeorico: number;
  promedioContado: number;
  mermaTotal: number;
  mermaPromedio: number;
  ultimaFecha: Date;
}

@Injectable()
export class ReporteRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Agrega todas las tomas físicas (ItemInventario) por artículo: teórico y
   * contado promedio, merma acumulada y cuántas veces disparó una alerta.
   * Ordenado por anomalías (desc) y luego por magnitud de la merma total,
   * para que "los artículos que más dan problemas" queden primero.
   */
  reporteVariacion(params: {
    almacenId?: string;
    desde?: Date;
    hasta?: Date;
  }): Promise<VariacionArticuloRow[]> {
    const filtroAlmacen = params.almacenId
      ? Prisma.sql`AND inv."almacenId" = ${params.almacenId}`
      : Prisma.empty;
    const filtroDesde = params.desde
      ? Prisma.sql`AND inv."fechaCorte" >= ${params.desde}`
      : Prisma.empty;
    const filtroHasta = params.hasta
      ? Prisma.sql`AND inv."fechaCorte" <= ${params.hasta}`
      : Prisma.empty;

    return this.prisma.$queryRaw<VariacionArticuloRow[]>`
      SELECT
        a.id AS "articuloId",
        a.sku,
        a.nombre,
        a.categoria,
        a."unidadEstd",
        COUNT(*)::int AS tomas,
        COUNT(*) FILTER (WHERE i."esAnomalia" = true)::int AS anomalias,
        AVG(i.teorico) AS "promedioTeorico",
        AVG(i."conteoFisico") AS "promedioContado",
        SUM(i."conteoFisico" - i.teorico) AS "mermaTotal",
        AVG(i."conteoFisico" - i.teorico) AS "mermaPromedio",
        MAX(inv."fechaCorte") AS "ultimaFecha"
      FROM items_inventario i
      JOIN articulos a ON a.id = i."articuloId"
      JOIN inventarios inv ON inv.id = i."inventarioId"
      WHERE 1 = 1
        ${filtroAlmacen}
        ${filtroDesde}
        ${filtroHasta}
      GROUP BY a.id, a.sku, a.nombre, a.categoria, a."unidadEstd"
      ORDER BY anomalias DESC, ABS(SUM(i."conteoFisico" - i.teorico)) DESC
      LIMIT 200
    `;
  }
}
