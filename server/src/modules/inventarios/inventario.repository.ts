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
  // "Activa" = todavía le falta al menos uno de los dos pasos: que el
  // OPERARIO la confirme (resuelto) y que un AUDITOR/ADMIN la revise
  // (revisadoPorAuditor) — ver el comentario en el modelo AlertaInventario.
  alertas: {
    where: { OR: [{ resuelto: false }, { revisadoPorAuditor: false }] },
    orderBy: { createdAt: 'desc' },
  },
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
  /** `articulo.unidadEstd` — la unidad ESTÁNDAR del artículo, ver el comentario en `marcarUnidadAmbigua`. */
  unidadEstd: UnidadMedida;
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
   * incompatibles como si fueran la misma).
   *
   * Bug real encontrado: la rama `create` solía guardar `conteoFisico` con
   * el valor TAL CUAL se dictó, en la unidad dictada (ej. "1" en UNIDAD) —
   * la idea era que quedara visible aunque estuviera en la unidad
   * "equivocada". El problema: si DESPUÉS llegaba un dictado válido para
   * el mismo artículo en la unidad correcta, ese dictado pasa por
   * `incrementarConteo` (un método DISTINTO), que hace `{increment: delta}`
   * a ciegas sobre el `conteoFisico` que ya hubiera — sumando un delta en
   * KILOGRAMOS sobre un valor sembrado en UNIDADES, como si fueran la misma
   * escala. El resultado observado: "20 kg" dictados dos veces sobre un
   * ítem que había arrancado con "1 unidad" ambigua terminaba mostrando 41
   * kg (1 + 20 + 20), un número sin sentido.
   *
   * Fix: la rama `create` ahora siempre arranca en 0, en la unidad
   * ESTÁNDAR del artículo (`unidadEstd`) — nunca en la unidad ambigua
   * dictada. Así, sin importar cuál de los dos métodos toque el ítem
   * primero, `conteoFisico` siempre vive en una sola escala consistente y
   * un incremento posterior nunca mezcla unidades. La rama `update` sigue
   * sin tocar `conteoFisico` (mismo motivo que antes: nunca reescribir con
   * un valor leído de antemano, mismo lost update que evita
   * `incrementarConteo`).
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
        conteoFisico: 0,
        unidadUsada: input.unidadEstd,
        esAnomalia: true,
      },
    });
  }

  /**
   * Dedupe contra alertas activas: dictar el mismo ítem otra vez mientras
   * sigue en el mismo estado problemático (misma unidad ambigua sin
   * resolver, sigue desviado del histórico) llamaba a `crearAlertas` de
   * nuevo en cada dictado — el operario terminaba viendo la MISMA anomalía
   * duplicada N veces en el modal (bug real reportado). Antes de insertar,
   * se descartan las que ya tienen una alerta activa (sin resolver Y sin
   * revisar por auditor) del mismo tipo para el mismo ítem — una anomalía
   * que ya se resolvió/revisó por completo sí puede volver a dispararse
   * como una alerta NUEVA si el problema reaparece después.
   */
  async crearAlertas(alertas: CrearAlertaInput[]): Promise<number> {
    if (alertas.length === 0) return 0;

    const itemIds = [
      ...new Set(
        alertas
          .map((a) => a.itemInventarioId)
          .filter((id): id is string => id !== undefined),
      ),
    ];
    const activas =
      itemIds.length > 0
        ? await this.prisma.alertaInventario.findMany({
            where: {
              itemInventarioId: { in: itemIds },
              OR: [{ resuelto: false }, { revisadoPorAuditor: false }],
            },
            select: { itemInventarioId: true, tipo: true },
          })
        : [];
    const clavesActivas = new Set(
      activas.map((a) => `${a.itemInventarioId}:${a.tipo}`),
    );

    const nuevas = alertas.filter(
      (a) => !clavesActivas.has(`${a.itemInventarioId}:${a.tipo}`),
    );
    if (nuevas.length === 0) return 0;

    const { count } = await this.prisma.alertaInventario.createMany({
      data: nuevas,
    });
    return count;
  }

  /**
   * Bug real encontrado: una alerta de ANOMALIA_CANTIDAD se crea con el
   * conteo que había EN ESE MOMENTO (ej. "20 kg se desvía -94%"). Si
   * después llegan más dictados válidos del mismo artículo y el TOTAL
   * acumulado ya no se desvía (ej. termina en 220 kg, dentro del rango
   * normal), `esAnomalia` se corrige a `false` en el ítem — pero la
   * alerta vieja seguía activa para siempre, sin ninguna forma de
   * resolverla desde la UI (la tarjeta del ítem solo abre el modal si
   * `item.esAnomalia` es `true`, que ya no lo es). El operario quedaba con
   * una alerta fantasma bloqueando la consolidación, sin ningún click que
   * la resolviera.
   *
   * Se auto-resuelven las alertas activas de un ítem cuyo tipo NO aparece
   * en la evaluación más reciente (`tiposVigentes`): ya no describen la
   * realidad actual del conteo, así que pedirle a un humano que las
   * revise con datos desactualizados no aporta nada. `revisadoPor` queda
   * con un marcador explícito de que fue el sistema, no un auditor, quien
   * las cerró — para que el rastro de auditoría no mienta.
   */
  async resolverAlertasSuperadas(
    itemInventarioId: string,
    tiposVigentes: TipoAlerta[],
  ): Promise<number> {
    const { count } = await this.prisma.alertaInventario.updateMany({
      where: {
        itemInventarioId,
        tipo: { notIn: tiposVigentes },
        OR: [{ resuelto: false }, { revisadoPorAuditor: false }],
      },
      data: {
        resuelto: true,
        revisadoPorAuditor: true,
        revisadoPor: 'sistema:reevaluacion',
        revisadoEn: new Date(),
      },
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
      where: {
        inventarioId,
        OR: [{ resuelto: false }, { revisadoPorAuditor: false }],
      },
    });
  }

  resolverAlerta(id: string): Promise<AlertaInventario> {
    return this.prisma.alertaInventario.update({
      where: { id },
      data: { resuelto: true },
    });
  }

  revisarAlerta(id: string, auditorId: string): Promise<AlertaInventario> {
    return this.prisma.alertaInventario.update({
      where: { id },
      data: {
        revisadoPorAuditor: true,
        revisadoPor: auditorId,
        revisadoEn: new Date(),
      },
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
