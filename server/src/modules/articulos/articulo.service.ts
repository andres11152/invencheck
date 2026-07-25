import { Injectable, NotFoundException } from '@nestjs/common';
import { ArticuloRepository } from './articulo.repository';
import { normalizeSpokenText } from './articulo-text.util';
import { FindArticulosQueryDto } from './dto/find-articulos-query.dto';
import type { Articulo } from '../../generated/prisma/client';

export interface VoiceMatchResult {
  textoNormalizado: string;
  articulo: Articulo | null;
  score: number;
}

/** Por debajo de este umbral, la coincidencia se considera no confiable. */
const VOICE_MATCH_MIN_SCORE = 0.35;

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

  /**
   * Mapea un texto dictado ("tres kilos de aji casero") al Articulo del
   * catálogo con mayor score de coincidencia difusa (nombre o aliases).
   */
  async normalizarEntradaHablada(texto: string): Promise<VoiceMatchResult> {
    const textoNormalizado = normalizeSpokenText(texto);
    if (!textoNormalizado) {
      return { textoNormalizado, articulo: null, score: 0 };
    }

    const [top] = await this.articuloRepository.findBestMatches(
      textoNormalizado,
      1,
    );
    if (!top || top.score < VOICE_MATCH_MIN_SCORE) {
      return { textoNormalizado, articulo: null, score: top?.score ?? 0 };
    }

    const { score, ...articulo } = top;
    return { textoNormalizado, articulo, score };
  }
}
