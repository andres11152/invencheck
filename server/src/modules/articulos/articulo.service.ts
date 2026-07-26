import { Injectable, NotFoundException } from '@nestjs/common';
import { ArticuloRepository } from './articulo.repository';
import { normalizeSpokenText } from './articulo-text.util';
import { FindArticulosQueryDto } from './dto/find-articulos-query.dto';
import type { Articulo } from '../../generated/prisma/client';

export interface VoiceMatchResult {
  textoNormalizado: string;
  articulo: Articulo | null;
  score: number;
  /**
   * Presente solo cuando hay ambigüedad real: el top-1 y al menos un
   * candidato más quedaron a menos de AMBIGUEDAD_GAP de distancia, ambos
   * por encima del umbral de aceptación. En ese caso `articulo` es `null`
   * a propósito — no tiene sentido auto-confirmar uno de los dos con la
   * misma confianza que el otro.
   */
  candidatosAmbiguos?: Articulo[];
}

/** Por debajo de este umbral, la coincidencia se considera no confiable. */
const VOICE_MATCH_MIN_SCORE = 0.35;

/**
 * Si el top-1 y el runner-up quedan a menos de esta distancia, no hay forma
 * confiable de saber cuál de los dos quiso decir el operario.
 *
 * Elegido con datos reales, no a ojo (server/src/scripts/audit-voice-matching.ts
 * contra los 938 artículos del catálogo real, simulando el alias autogenerado
 * de cada uno como dictado):
 *   - Sin este chequeo: 78 casos (8.3%) se auto-confirmaban en silencio
 *     contra el artículo incorrecto, con score alto (~1.09 promedio).
 *   - Gap 0.15: bajaba a 8 residuales (0.85%) — casi todos insumo-crudo vs.
 *     porción-preparada, un patrón aparte (ver TipoAlerta/esProcesado).
 *   - Gap 0.3 (el elegido): 0 residuales. El costo es que 175/938 (18.7%)
 *     de los dictados ahora piden precisión en vez de auto-confirmar —
 *     aceptable: el objetivo central de la app es que ninguna anomalía (acá,
 *     ambigüedad) pase sin que alguien la confirme.
 */
const AMBIGUEDAD_GAP = 0.3;

@Injectable()
export class ArticuloService {
  constructor(private readonly articuloRepository: ArticuloRepository) {}

  findAll(query: FindArticulosQueryDto) {
    const limit = query.limit ?? 20;
    const search = query.search?.trim();

    if (search) {
      return this.articuloRepository.searchByQuery(search, {
        categoria: query.categoria,
        limit,
      });
    }

    return this.articuloRepository.findAll({
      categoria: query.categoria,
      limit,
    });
  }

  async findById(id: string): Promise<Articulo> {
    const articulo = await this.articuloRepository.findById(id);
    if (!articulo) {
      throw new NotFoundException(`Artículo ${id} no encontrado`);
    }
    return articulo;
  }

  /** Lookup exacto por SKU (código de barras escaneado) — sin matching difuso. */
  findBySku(sku: string): Promise<Articulo | null> {
    return this.articuloRepository.findBySku(sku);
  }

  /**
   * Mapea un texto dictado ("tres kilos de aji casero") al Articulo del
   * catálogo con mayor score de coincidencia difusa (nombre o aliases).
   */
  async normalizarEntradaHablada(texto: string): Promise<VoiceMatchResult> {
    const textoNormalizado = normalizeSpokenText(texto);
    if (!textoNormalizado) {
      return { textoNormalizado, articulo: null, score: 0 };
    }

    // Se piden hasta 3 candidatos (no solo el top-1) para poder detectar
    // ambigüedad: un top-1 con score alto no basta si el runner-up viene
    // casi empatado.
    const candidatos = await this.articuloRepository.findBestMatches(
      textoNormalizado,
      3,
    );
    const [top, segundo] = candidatos;
    if (!top || top.score < VOICE_MATCH_MIN_SCORE) {
      return { textoNormalizado, articulo: null, score: top?.score ?? 0 };
    }

    if (
      segundo &&
      segundo.score >= VOICE_MATCH_MIN_SCORE &&
      top.score - segundo.score < AMBIGUEDAD_GAP
    ) {
      const candidatosAmbiguos = candidatos
        .filter((c) => top.score - c.score < AMBIGUEDAD_GAP)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .map(({ score, ...articulo }) => articulo);
      return {
        textoNormalizado,
        articulo: null,
        score: top.score,
        candidatosAmbiguos,
      };
    }

    const { score, ...articulo } = top;
    return { textoNormalizado, articulo, score };
  }
}
