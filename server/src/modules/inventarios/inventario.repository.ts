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

export interface IncrementarConteoInput {
  inventarioId: string;
  articuloId: string;
  /** Ya convertido a `Articulo.unidadEstd` — este método no convierte unidades. */
  delta: number;
  unidadUsada: UnidadMedida;
  /** Solo se usa si el ítem no existía todavía (rama `create` del upsert). */
  teoricoInicial: number;
}

export interface MarcarUnidadAmbiguaInput {
  inventarioId: string;
  articuloId: string;
  teoricoInicial: number;
  cantidadDictada: number;
  unidadDictada: UnidadMedida;
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

  /**
   * Promedio histórico de conteos de ESTE artículo en ESTA bodega
   * específica (tomas físicas pasadas), excluyendo el inventario actual —
   * no tendría sentido comparar el conteo contra sí mismo mientras se está
   * armando en vivo. `null` si esta bodega todavía no tiene ningún
   * historial propio de este artículo (bodega nueva, o primera vez que se
   * cuenta ahí) — el llamador decide cómo degradar (cae al promedio global
   * del catálogo en `AnomaliasService.evaluarConteo`).
   */
  async promedioHistoricoPorAlmacen(
    articuloId: string,
    almacenId: string,
    excluirInventarioId: string,
  ): Promise<number | null> {
    const result = await this.prisma.itemInventario.aggregate({
      where: {
        articuloId,
        inventarioId: { not: excluirInventarioId },
        inventario: { almacenId },
      },
      _avg: { conteoFisico: true },
      _count: true,
    });
    if (result._count === 0) return null;
    return result._avg.conteoFisico;
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

  /**
   * Suma `delta` al conteo físico existente de forma ATÓMICA en Postgres
   * (`UPDATE ... SET "conteoFisico" = "conteoFisico" + $delta`) en vez de
   * leer-sumar-escribir desde código de aplicación. Evita el "lost update":
   * si dos operarios dictan el mismo artículo casi al mismo tiempo, cada
   * request le dice a Postgres "súmale esto" — nunca "ponlo en X" — así que
   * ninguna de las dos escrituras puede pisar a la otra, sin importar el
   * orden en que lleguen.
   *
   * `esAnomalia` se deja en `false` en la rama `create` y sin tocar en la
   * rama `update` — el llamador la corrige en un segundo paso con
   * `actualizarEsAnomalia`, después de evaluar la anomalía contra el TOTAL
   * ya sumado (que este método devuelve), nunca contra un valor leído antes
   * del incremento.
   */
  incrementarConteo(input: IncrementarConteoInput): Promise<ItemInventario> {
    return this.prisma.itemInventario.upsert({
      where: {
        inventarioId_articuloId: {
          inventarioId: input.inventarioId,
          articuloId: input.articuloId,
        },
      },
      update: {
        conteoFisico: { increment: input.delta },
        unidadUsada: input.unidadUsada,
      },
      create: {
        inventarioId: input.inventarioId,
        articuloId: input.articuloId,
        teorico: input.teoricoInicial,
        conteoFisico: input.delta,
        unidadUsada: input.unidadUsada,
        esAnomalia: false,
      },
    });
  }

  actualizarEsAnomalia(
    itemInventarioId: string,
    esAnomalia: boolean,
  ): Promise<ItemInventario> {
    return this.prisma.itemInventario.update({
      where: { id: itemInventarioId },
      data: { esAnomalia },
    });
  }

  /**
   * Unidad dictada sin conversión conocida al estándar del catálogo: no se
   * puede sumar con seguridad al conteo acumulado (mezclaría unidades
   * incompatibles como si fueran la misma). Si el artículo no tenía conteo
   * todavía, se crea con el valor tal cual se dictó — visible aunque esté en
   * la unidad "equivocada", para que se note y se corrija — pero si YA
   * existía, la rama `update` sólo toca `esAnomalia`: nunca reescribe
   * `conteoFisico` con un valor leído de antemano (mismo lost update que
   * `incrementarConteo` evita, pero acá la salida segura es simplemente "no
   * tocar el número" en vez de sumarlo).
   */
  marcarUnidadAmbigua(
    input: MarcarUnidadAmbiguaInput,
  ): Promise<ItemInventario> {
    return this.prisma.itemInventario.upsert({
      where: {
        inventarioId_articuloId: {
          inventarioId: input.inventarioId,
          articuloId: input.articuloId,
        },
      },
      update: { esAnomalia: true },
      create: {
        inventarioId: input.inventarioId,
        articuloId: input.articuloId,
        teorico: input.teoricoInicial,
        conteoFisico: input.cantidadDictada,
        unidadUsada: input.unidadDictada,
        esAnomalia: true,
      },
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
