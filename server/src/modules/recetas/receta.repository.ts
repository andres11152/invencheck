import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  Prisma,
  type Receta,
  type UnidadMedida,
} from '../../generated/prisma/client';

const RECETA_DETALLE_INCLUDE = {
  items: {
    include: { articulo: true },
    orderBy: { articulo: { nombre: 'asc' } },
  },
} satisfies Prisma.RecetaInclude;

export type RecetaDetalle = Prisma.RecetaGetPayload<{
  include: typeof RECETA_DETALLE_INCLUDE;
}>;

export interface StockActual {
  conteoFisico: number;
  unidadUsada: UnidadMedida;
}

@Injectable()
export class RecetaRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<Receta[]> {
    return this.prisma.receta.findMany({ orderBy: { nombre: 'asc' } });
  }

  findDetalleById(id: string): Promise<RecetaDetalle | null> {
    return this.prisma.receta.findUnique({
      where: { id },
      include: RECETA_DETALLE_INCLUDE,
    });
  }

  /**
   * Última toma física registrada para un artículo, como proxy de "stock
   * actual" (no hay integración ERP en vivo). Si se pasa `almacenId`, se
   * limita a tomas de esa bodega; si no, se toma la más reciente de
   * cualquier bodega.
   */
  async stockActualPorArticulo(
    articuloId: string,
    almacenId?: string,
  ): Promise<StockActual | null> {
    const item = await this.prisma.itemInventario.findFirst({
      where: {
        articuloId,
        ...(almacenId ? { inventario: { almacenId } } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      select: { conteoFisico: true, unidadUsada: true },
    });
    return item;
  }
}
