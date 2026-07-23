import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  Prisma,
  type Articulo,
  type UnidadMedida,
} from '../../generated/prisma/client';

export interface ArticuloUpsertInput {
  sku: string | null;
  nombre: string;
  aliases: string[];
  categoria: string;
  unidadEstd: UnidadMedida;
  esProcesado: boolean;
  stockHistoricoAvg: number | null;
}

export interface ArticuloMatch extends Articulo {
  score: number;
}

@Injectable()
export class ArticuloRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(
    params: { categoria?: string; limit: number; offset?: number } = {
      limit: 20,
    },
  ): Promise<Articulo[]> {
    return this.prisma.articulo.findMany({
      where: params.categoria ? { categoria: params.categoria } : undefined,
      orderBy: { nombre: 'asc' },
      take: params.limit,
      skip: params.offset ?? 0,
    });
  }

  findById(id: string): Promise<Articulo | null> {
    return this.prisma.articulo.findUnique({ where: { id } });
  }

  findBySku(sku: string): Promise<Articulo | null> {
    return this.prisma.articulo.findUnique({ where: { sku } });
  }

  count(where: { esProcesado?: boolean } = {}): Promise<number> {
    return this.prisma.articulo.count({ where });
  }

  /** Búsqueda parcial (ILIKE) por nombre, sku o alias. */
  searchByQuery(
    query: string,
    params: { categoria?: string; limit: number },
  ): Promise<Articulo[]> {
    const pattern = `%${query}%`;
    const categoriaFilter = params.categoria
      ? Prisma.sql`AND a.categoria = ${params.categoria}`
      : Prisma.empty;

    return this.prisma.$queryRaw<Articulo[]>`
      SELECT a.*
      FROM articulos a
      WHERE (
        a.nombre ILIKE ${pattern}
        OR a.sku ILIKE ${pattern}
        OR EXISTS (SELECT 1 FROM unnest(a.aliases) AS alias WHERE alias ILIKE ${pattern})
      )
      ${categoriaFilter}
      ORDER BY a.nombre ASC
      LIMIT ${params.limit}
    `;
  }

  /**
   * Ranking por similitud de trigramas (pg_trgm) contra nombre y aliases,
   * insensible a acentos (unaccent). Clave para mapear dictado de voz.
   */
  findBestMatches(
    normalizedQuery: string,
    limit = 5,
  ): Promise<ArticuloMatch[]> {
    return this.prisma.$queryRaw<ArticuloMatch[]>`
      SELECT a.*, GREATEST(
        similarity(unaccent(lower(a.nombre)), ${normalizedQuery}),
        COALESCE((
          SELECT MAX(similarity(unaccent(lower(alias)), ${normalizedQuery}))
          FROM unnest(a.aliases) AS alias
        ), 0)
      ) AS score
      FROM articulos a
      ORDER BY score DESC
      LIMIT ${limit}
    `;
  }

  /**
   * Upsert masivo por `sku` (si existe) o `nombre` (catálogo maestro).
   *
   * No se usa `prisma.articulo.upsert()` porque solo resuelve conflicto
   * contra UNA clave única a la vez: una fila entrante con un `sku` nuevo
   * pero un `nombre` que ya existe con otro sku (p. ej. reimportar sobre
   * datos de seed) rompería el unique de `nombre` al intentar el CREATE.
   * Por eso se busca primero por sku O nombre y se decide update/create.
   */
  async upsertMany(rows: ArticuloUpsertInput[]): Promise<number> {
    for (const row of rows) {
      const existing = await this.prisma.articulo.findFirst({
        where: row.sku
          ? { OR: [{ sku: row.sku }, { nombre: row.nombre }] }
          : { nombre: row.nombre },
      });

      const data = {
        sku: row.sku,
        nombre: row.nombre,
        aliases: row.aliases,
        categoria: row.categoria,
        unidadEstd: row.unidadEstd,
        esProcesado: row.esProcesado,
        stockHistoricoAvg: row.stockHistoricoAvg,
      };

      if (existing) {
        await this.prisma.articulo.update({ where: { id: existing.id }, data });
      } else {
        await this.prisma.articulo.create({ data });
      }
    }
    return rows.length;
  }
}
