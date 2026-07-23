import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EstadoInventario,
  Prisma,
  TipoAlerta,
  UnidadMedida,
  type AlertaInventario,
  type Inventario,
  type ItemInventario,
} from '../../generated/prisma/client';

const INVENTARIO_DETALLE_INCLUDE = {
  almacen: true,
  items: { include: { articulo: true }, orderBy: { updatedAt: 'desc' } },
  alertas: { where: { resuelto: false }, orderBy: { createdAt: 'desc' } },
  // Si ESTE inventario es la auditoría ciega de otro (solo id/dueño, no conteos).
  auditaA: {
    select: {
      id: true,
      usuarioId: true,
      almacen: { select: { nombre: true } },
    },
  },
  // Si ESTE inventario TIENE una auditoría ciega en curso.
  auditoriaCiega: { select: { id: true, usuarioId: true, estado: true } },
} satisfies Prisma.InventarioInclude;

export type InventarioDetalle = Prisma.InventarioGetPayload<{
  include: typeof INVENTARIO_DETALLE_INCLUDE;
}>;

export interface UpsertItemInput {
  inventarioId: string;
  articuloId: string;
  teorico: number;
  conteoFisico: number;
  unidadUsada: UnidadMedida;
  esAnomalia: boolean;
}

export interface CrearAlertaInput {
  inventarioId: string;
  itemInventarioId?: string;
  tipo: TipoAlerta;
  mensaje: string;
}

@Injectable()
export class InventarioRepository {
  constructor(private readonly prisma: PrismaService) {}

  crearInventario(data: {
    almacenId: string;
    usuarioId: string;
    auditorId?: string;
    fechaCorte?: Date;
  }): Promise<Inventario> {
    return this.prisma.inventario.create({
      data: {
        almacenId: data.almacenId,
        usuarioId: data.usuarioId,
        auditorId: data.auditorId,
        fechaCorte: data.fechaCorte ?? new Date(),
      },
    });
  }

  findById(id: string): Promise<Inventario | null> {
    return this.prisma.inventario.findUnique({ where: { id } });
  }

  findDetalleById(id: string): Promise<InventarioDetalle | null> {
    return this.prisma.inventario.findUnique({
      where: { id },
      include: INVENTARIO_DETALLE_INCLUDE,
    });
  }

  findItem(
    inventarioId: string,
    articuloId: string,
  ): Promise<ItemInventario | null> {
    return this.prisma.itemInventario.findUnique({
      where: { inventarioId_articuloId: { inventarioId, articuloId } },
    });
  }

  /** Una sola línea por artículo: recontar el mismo artículo actualiza la línea existente. */
  upsertItem(data: UpsertItemInput): Promise<ItemInventario> {
    return this.prisma.itemInventario.upsert({
      where: {
        inventarioId_articuloId: {
          inventarioId: data.inventarioId,
          articuloId: data.articuloId,
        },
      },
      update: {
        teorico: data.teorico,
        conteoFisico: data.conteoFisico,
        unidadUsada: data.unidadUsada,
        esAnomalia: data.esAnomalia,
      },
      create: data,
    });
  }

  async crearAlertas(alertas: CrearAlertaInput[]): Promise<number> {
    if (alertas.length === 0) return 0;
    const { count } = await this.prisma.alertaInventario.createMany({
      data: alertas,
    });
    return count;
  }

  cambiarEstado(id: string, estado: EstadoInventario): Promise<Inventario> {
    return this.prisma.inventario.update({
      where: { id },
      data: { estado },
    });
  }

  findAlerta(id: string): Promise<AlertaInventario | null> {
    return this.prisma.alertaInventario.findUnique({ where: { id } });
  }

  contarAlertasActivas(inventarioId: string): Promise<number> {
    return this.prisma.alertaInventario.count({
      where: { inventarioId, resuelto: false },
    });
  }

  resolverAlerta(id: string): Promise<AlertaInventario> {
    return this.prisma.alertaInventario.update({
      where: { id },
      data: { resuelto: true },
    });
  }

  /**
   * Crea el Inventario "gemelo" de auditoría ciega: misma bodega, mismo
   * corte, pero sin ningún ItemInventario copiado — el auditor cuenta desde
   * cero y de forma independiente. Marca el original como EN_AUDITORIA.
   */
  crearAuditoriaCiega(
    originalId: string,
    auditorId: string,
  ): Promise<Inventario> {
    return this.prisma.$transaction(async (tx) => {
      const original = await tx.inventario.findUniqueOrThrow({
        where: { id: originalId },
      });
      const auditoria = await tx.inventario.create({
        data: {
          almacenId: original.almacenId,
          usuarioId: auditorId,
          fechaCorte: original.fechaCorte,
          auditaAId: originalId,
        },
      });
      await tx.inventario.update({
        where: { id: originalId },
        data: { auditorId, estado: EstadoInventario.EN_AUDITORIA },
      });
      return auditoria;
    });
  }

  findAuditoriaCiega(originalId: string): Promise<Inventario | null> {
    return this.prisma.inventario.findUnique({
      where: { auditaAId: originalId },
    });
  }
}
