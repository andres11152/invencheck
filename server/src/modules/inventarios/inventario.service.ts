import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AlmacenRepository } from '../almacenes/almacen.repository';
import { ArticuloService } from '../articulos/articulo.service';
import { AiEngineService, FuenteDictado } from '../ai-engine/ai-engine.service';
import { AnomaliasService } from './services/anomalias.service';
import {
  InventarioDetalle,
  InventarioRepository,
} from './inventario.repository';
import {
  factorConversion,
  round2,
} from '../../common/utils/unit-conversion.util';
import {
  EstadoInventario,
  TipoAlerta,
  type Articulo,
  type Inventario,
  type UnidadMedida,
} from '../../generated/prisma/client';
import { IntegrationErpService } from '../integration/integration-erp.service';

export interface ItemProcesadoResumen {
  articuloBusqueda: string;
  articulo: Articulo;
  cantidadDictada: number;
  unidadDictada: UnidadMedida;
  teorico: number;
  conteoFisico: number;
  unidadUsada: UnidadMedida;
  esAnomalia: boolean;
  alertas: string[];
  scoreMatch: number;
}

export interface ItemNoMatcheado {
  articuloBusqueda: string;
  cantidadDictada: number;
  unidadDictada: UnidadMedida;
  motivo: string;
}

export interface ProcesarTomaPorVozResult {
  inventario: InventarioDetalle;
  fuenteIA: FuenteDictado;
  itemsMatcheados: ItemProcesadoResumen[];
  itemsNoMatcheados: ItemNoMatcheado[];
}

export interface ComparacionAuditoriaItem {
  articulo: Articulo;
  unidad: UnidadMedida;
  conteoOriginal: number | null;
  conteoAuditoria: number | null;
  diferencia: number | null;
  coincide: boolean;
}

export interface ComparacionAuditoriaResult {
  original: InventarioDetalle;
  auditoria: InventarioDetalle | null;
  items: ComparacionAuditoriaItem[];
}

/** Diferencias dentro de esta tolerancia se consideran "coinciden" (redondeo). */
const TOLERANCIA_COINCIDENCIA = 0.01;

const ESTADOS_INMUTABLES = new Set<EstadoInventario>([
  EstadoInventario.ENVIADO_ERP,
]);

@Injectable()
export class InventarioService {
  constructor(
    private readonly inventarioRepository: InventarioRepository,
    private readonly almacenRepository: AlmacenRepository,
    private readonly articuloService: ArticuloService,
    private readonly aiEngineService: AiEngineService,
    private readonly anomaliasService: AnomaliasService,
    private readonly integrationErpService: IntegrationErpService,
  ) {}

  async crear(dto: {
    almacenId: string;
    usuarioId: string;
    auditorId?: string;
    fechaCorte?: Date;
  }): Promise<Inventario> {
    const almacen = await this.almacenRepository.findById(dto.almacenId);
    if (!almacen) {
      throw new NotFoundException(`Almacén ${dto.almacenId} no encontrado`);
    }
    return this.inventarioRepository.crearInventario(dto);
  }

  async findDetalle(id: string): Promise<InventarioDetalle> {
    const inventario = await this.inventarioRepository.findDetalleById(id);
    if (!inventario) {
      throw new NotFoundException(`Inventario ${id} no encontrado`);
    }
    return inventario;
  }

  async cambiarEstado(
    id: string,
    estado: EstadoInventario,
  ): Promise<Inventario> {
    const inventario = await this.inventarioRepository.findById(id);
    if (!inventario) {
      throw new NotFoundException(`Inventario ${id} no encontrado`);
    }
    if (ESTADOS_INMUTABLES.has(inventario.estado)) {
      throw new BadRequestException(
        `El inventario ya fue ${inventario.estado} y no admite cambios de estado`,
      );
    }

    // El dato anómalo se guarda de inmediato (no se pierde si el operario
    // cierra la app), pero no puede "pasar" a la consolidación/legalización
    // final sin que alguien lo haya revisado explícitamente.
    if (
      estado === EstadoInventario.CONCILIADO ||
      estado === EstadoInventario.ENVIADO_ERP
    ) {
      const alertasActivas =
        await this.inventarioRepository.contarAlertasActivas(id);
      if (alertasActivas > 0) {
        throw new BadRequestException(
          `No se puede consolidar: hay ${alertasActivas} alerta(s) sin confirmar. Revisa las anomalías antes de cerrar el inventario.`,
        );
      }
    }

    if (estado === EstadoInventario.ENVIADO_ERP) {
      await this.integrationErpService.enviarInventarioAERP(id);
      return (await this.inventarioRepository.findById(id))!;
    }

    return this.inventarioRepository.cambiarEstado(id, estado);
  }

  /**
   * Crea la auditoría ciega: un segundo Inventario, misma bodega, conteo
   * completamente independiente (nadie copia los números del original).
   */
  async crearAuditoriaCiega(
    originalId: string,
    auditorId: string,
  ): Promise<Inventario> {
    const original = await this.inventarioRepository.findById(originalId);
    if (!original) {
      throw new NotFoundException(`Inventario ${originalId} no encontrado`);
    }
    if (original.auditaAId) {
      throw new BadRequestException(
        'Este inventario ya ES una auditoría ciega de otro; no se puede auditar una auditoría',
      );
    }
    if (ESTADOS_INMUTABLES.has(original.estado)) {
      throw new BadRequestException(
        `El inventario ya fue ${original.estado} y no admite auditoría`,
      );
    }
    const existente =
      await this.inventarioRepository.findAuditoriaCiega(originalId);
    if (existente) {
      throw new BadRequestException(
        'Este inventario ya tiene una auditoría ciega en curso',
      );
    }

    return this.inventarioRepository.crearAuditoriaCiega(originalId, auditorId);
  }

  /**
   * Compara, artículo por artículo, el conteo del operario original contra
   * el de la auditoría ciega (si existe). Los artículos contados por solo
   * uno de los dos también se reportan como discrepancia.
   */
  async compararAuditoria(
    originalId: string,
  ): Promise<ComparacionAuditoriaResult> {
    const original = await this.findDetalle(originalId);
    const auditoriaRow =
      await this.inventarioRepository.findAuditoriaCiega(originalId);

    if (!auditoriaRow) {
      return { original, auditoria: null, items: [] };
    }
    const auditoria = await this.findDetalle(auditoriaRow.id);

    const porArticulo = new Map<
      string,
      {
        articulo: Articulo;
        unidad: UnidadMedida;
        conteoOriginal: number | null;
        conteoAuditoria: number | null;
      }
    >();

    for (const item of original.items) {
      porArticulo.set(item.articuloId, {
        articulo: item.articulo,
        unidad: item.unidadUsada,
        conteoOriginal: item.conteoFisico,
        conteoAuditoria: null,
      });
    }
    for (const item of auditoria.items) {
      const existente = porArticulo.get(item.articuloId);
      if (existente) {
        existente.conteoAuditoria = item.conteoFisico;
      } else {
        porArticulo.set(item.articuloId, {
          articulo: item.articulo,
          unidad: item.unidadUsada,
          conteoOriginal: null,
          conteoAuditoria: item.conteoFisico,
        });
      }
    }

    const items: ComparacionAuditoriaItem[] = [...porArticulo.values()]
      .map((entrada) => {
        const ambosContados =
          entrada.conteoOriginal !== null && entrada.conteoAuditoria !== null;
        const diferencia = ambosContados
          ? round2(entrada.conteoAuditoria! - entrada.conteoOriginal!)
          : null;
        const coincide =
          diferencia !== null &&
          Math.abs(diferencia) <= TOLERANCIA_COINCIDENCIA;
        return { ...entrada, diferencia, coincide };
      })
      .sort((a, b) => Number(a.coincide) - Number(b.coincide));

    return { original, auditoria, items };
  }

  async resolverAlerta(inventarioId: string, alertaId: string) {
    const alerta = await this.inventarioRepository.findAlerta(alertaId);
    if (!alerta || alerta.inventarioId !== inventarioId) {
      throw new NotFoundException(
        `Alerta ${alertaId} no encontrada en el inventario ${inventarioId}`,
      );
    }
    return this.inventarioRepository.resolverAlerta(alertaId);
  }

  /**
   * Orquesta el flujo de toma física por voz: IA/parser -> match difuso de
   * artículo -> evaluación de anomalías -> persistencia de línea + alertas.
   */
  async procesarTomaPorVoz(
    inventarioId: string,
    textoVoz: string,
  ): Promise<ProcesarTomaPorVozResult> {
    const inventario = await this.validarInventarioEditable(inventarioId);

    const { items, fuente } =
      await this.aiEngineService.procesarDictadoVoz(textoVoz);

    const itemsMatcheados: ItemProcesadoResumen[] = [];
    const itemsNoMatcheados: ItemNoMatcheado[] = [];

    for (const item of items) {
      const match = await this.articuloService.normalizarEntradaHablada(
        item.articuloBusqueda,
      );

      if (!match.articulo) {
        itemsNoMatcheados.push({
          articuloBusqueda: item.articuloBusqueda,
          cantidadDictada: item.cantidad,
          unidadDictada: item.unidadDictada,
          motivo: 'Sin coincidencia en el catálogo de artículos',
        });
        continue;
      }

      itemsMatcheados.push(
        await this.procesarLineaArticulo({
          inventarioId,
          almacenId: inventario.almacenId,
          articulo: match.articulo,
          articuloBusqueda: item.articuloBusqueda,
          cantidadDictada: item.cantidad,
          unidadDictada: item.unidadDictada,
          scoreMatch: match.score,
        }),
      );
    }

    return {
      inventario: await this.findDetalle(inventarioId),
      fuenteIA: fuente,
      itemsMatcheados,
      itemsNoMatcheados,
    };
  }

  /**
   * Entrada alterna al mismo flujo de conteo, pero por SKU exacto (escáner
   * de código de barras) en vez de texto dictado. A diferencia de
   * `procesarTomaPorVoz`, NO pasa por el matching difuso: un código de
   * barras ya identifica el artículo sin ambigüedad, así que forzarlo por el
   * pipeline de texto libre (como se hacía antes, armando un string tipo
   * "1 unidad de sku 12345" y mandándolo a `normalizarEntradaHablada`) es
   * incorrecto — `findBestMatches` solo compara contra `nombre`/`aliases`,
   * nunca contra la columna `sku`, así que ese string terminaba matcheando
   * (o no) por casualidad contra el nombre de un artículo cualquiera.
   */
  async procesarConteoPorSku(
    inventarioId: string,
    sku: string,
    cantidad: number,
    unidadDictada: UnidadMedida,
  ): Promise<ProcesarTomaPorVozResult> {
    const inventario = await this.validarInventarioEditable(inventarioId);

    const itemsMatcheados: ItemProcesadoResumen[] = [];
    const itemsNoMatcheados: ItemNoMatcheado[] = [];

    const articulo = await this.articuloService.findBySku(sku);
    if (!articulo) {
      itemsNoMatcheados.push({
        articuloBusqueda: sku,
        cantidadDictada: cantidad,
        unidadDictada,
        motivo: `Ningún artículo del catálogo tiene el SKU "${sku}"`,
      });
    } else {
      itemsMatcheados.push(
        await this.procesarLineaArticulo({
          inventarioId,
          almacenId: inventario.almacenId,
          articulo,
          articuloBusqueda: `SKU ${sku}`,
          cantidadDictada: cantidad,
          unidadDictada,
          scoreMatch: 1, // match exacto por SKU, no difuso
        }),
      );
    }

    return {
      inventario: await this.findDetalle(inventarioId),
      fuenteIA: 'ESCANER_SKU',
      itemsMatcheados,
      itemsNoMatcheados,
    };
  }

  private async validarInventarioEditable(
    inventarioId: string,
  ): Promise<Inventario> {
    const inventario = await this.inventarioRepository.findById(inventarioId);
    if (!inventario) {
      throw new NotFoundException(`Inventario ${inventarioId} no encontrado`);
    }
    if (ESTADOS_INMUTABLES.has(inventario.estado)) {
      throw new BadRequestException(
        `El inventario ya fue ${inventario.estado} y no admite nuevos conteos`,
      );
    }
    return inventario;
  }

  /**
   * Ya con el `Articulo` resuelto (por matching difuso o por SKU exacto):
   * convierte unidad, acumula el conteo de forma atómica, evalúa anomalías
   * contra el histórico de la bodega y persiste alertas. Compartido por
   * `procesarTomaPorVoz` y `procesarConteoPorSku` — la única diferencia
   * entre ambos flujos es CÓMO se llega al `Articulo`, no qué se hace una
   * vez identificado.
   */
  private async procesarLineaArticulo(params: {
    inventarioId: string;
    almacenId: string;
    articulo: Articulo;
    articuloBusqueda: string;
    cantidadDictada: number;
    unidadDictada: UnidadMedida;
    scoreMatch: number;
  }): Promise<ItemProcesadoResumen> {
    const {
      inventarioId,
      almacenId,
      articulo,
      cantidadDictada,
      unidadDictada,
    } = params;

    // El ítem puede ya haber sido contado antes en esta misma toma (ej. en
    // otro estante) — la nueva cantidad dictada se ACUMULA a la previa en
    // vez de sobreescribirse. La unidad se convierte ANTES de sumar (nunca
    // se mezclan kg + gramos como números crudos) y la suma en sí se hace
    // con un `increment` atómico en Postgres, no leyendo-sumando-escribiendo
    // en código de aplicación: así dos dictados casi simultáneos del mismo
    // artículo no se pisan entre sí (lost update).
    const factor =
      unidadDictada === articulo.unidadEstd
        ? 1
        : factorConversion(unidadDictada, articulo.unidadEstd);

    if (factor === undefined) {
      const mensaje = `Se dictó en ${unidadDictada} pero "${articulo.nombre}" se maneja en ${articulo.unidadEstd}; no hay conversión automática disponible.`;
      const itemInventario =
        await this.inventarioRepository.marcarUnidadAmbigua({
          inventarioId,
          articuloId: articulo.id,
          teoricoInicial: articulo.stockHistoricoAvg ?? 0,
          cantidadDictada,
          unidadDictada,
        });
      await this.inventarioRepository.crearAlertas([
        {
          inventarioId,
          itemInventarioId: itemInventario.id,
          tipo: TipoAlerta.UNIDAD_AMBIGUA,
          mensaje,
        },
      ]);

      return {
        articuloBusqueda: params.articuloBusqueda,
        articulo,
        cantidadDictada,
        unidadDictada,
        teorico: itemInventario.teorico,
        conteoFisico: itemInventario.conteoFisico,
        unidadUsada: itemInventario.unidadUsada,
        esAnomalia: true,
        alertas: [mensaje],
        scoreMatch: params.scoreMatch,
      };
    }

    const delta = round2(cantidadDictada * factor);
    const itemInventario = await this.inventarioRepository.incrementarConteo({
      inventarioId,
      articuloId: articulo.id,
      delta,
      unidadUsada: articulo.unidadEstd,
      teoricoInicial: articulo.stockHistoricoAvg ?? 0,
    });

    // El "patrón normal" para detectar anomalías debe ser el de ESTA
    // bodega, no un promedio global mezclado entre las ~48 bodegas del
    // catálogo (una tiene normalmente 9 cajas, otra 90 — promediarlas no
    // sirve para juzgar ninguna de las dos). Si esta bodega no tiene
    // historial propio de este artículo todavía, evaluarConteo cae solo
    // al promedio global (`articulo.stockHistoricoAvg`).
    const promedioHistoricoBodega =
      await this.inventarioRepository.promedioHistoricoPorAlmacen(
        articulo.id,
        almacenId,
        inventarioId,
      );

    // `unidadDictada: articulo.unidadEstd` porque `itemInventario.conteoFisico`
    // ya viene convertido y acumulado — evita que evaluarConteo lo convierta
    // una segunda vez (su Regla 3 solo actúa si unidadDictada !== unidadEstd).
    const evaluacion = this.anomaliasService.evaluarConteo({
      articulo,
      teorico: itemInventario.teorico,
      conteoFisico: itemInventario.conteoFisico,
      unidadDictada: articulo.unidadEstd,
      promedioHistoricoBodega,
    });

    await this.inventarioRepository.actualizarEsAnomalia(
      itemInventario.id,
      evaluacion.esAnomalia,
    );

    if (evaluacion.alertas.length > 0) {
      await this.inventarioRepository.crearAlertas(
        evaluacion.alertas.map((alerta) => ({
          inventarioId,
          itemInventarioId: itemInventario.id,
          tipo: alerta.tipo,
          mensaje: alerta.mensaje,
        })),
      );
    }

    return {
      articuloBusqueda: params.articuloBusqueda,
      articulo,
      cantidadDictada,
      unidadDictada,
      teorico: itemInventario.teorico,
      conteoFisico: evaluacion.conteoFisico,
      unidadUsada: evaluacion.unidadUsada,
      esAnomalia: evaluacion.esAnomalia,
      alertas: evaluacion.alertas.map((a) => a.mensaje),
      scoreMatch: params.scoreMatch,
    };
  }
}
