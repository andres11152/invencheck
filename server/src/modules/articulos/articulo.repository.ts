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
   * Ranking por similitud de trigramas (pg_trgm) + bonificación por palabra clave
   * exacta contra nombre y aliases, insensible a acentos (unaccent).
   */
  findBestMatches(
    normalizedQuery: string,
    limit = 5,
  ): Promise<ArticuloMatch[]> {
    return this.prisma.$queryRaw<ArticuloMatch[]>`
      SELECT a.*, (
        GREATEST(
          similarity(public.f_unaccent(lower(a.nombre)), ${normalizedQuery}),
          COALESCE((
            SELECT MAX(similarity(public.f_unaccent(lower(alias)), ${normalizedQuery}))
            FROM unnest(a.aliases) AS alias
          ), 0)
        )
        + CASE 
            WHEN public.f_unaccent(lower(a.nombre)) = ${normalizedQuery} THEN 0.5
            WHEN public.f_unaccent(lower(a.nombre)) ILIKE ${'%' + normalizedQuery + '%'} THEN 0.25
            ELSE 0 
          END
      ) AS score
      FROM articulos a
      ORDER BY score DESC
      LIMIT ${limit}
    `;
  }

  /**
   * Otros artículos cuyo nombre es una extensión real del texto dictado
   * ("arroz" -> "ARROZ DOÑA PEPA", "ARROZ BASMATI", ...). Se consulta aparte
   * de `findBestMatches` porque el score de similitud de trigramas no
   * detecta esto de forma confiable: un prefijo corto dentro de un nombre
   * mucho más largo diluye la similitud (y por lo tanto el gap con el
   * match exacto), aunque la relación textual — "arroz" es literalmente el
   * primer token de esos otros nombres — sea inequívoca.
   *
   * Límite de 5 OTRAS variantes (sin contar el propio match exacto): el
   * peor caso real en el catálogo completo (938 artículos, `npm run
   * audit:voice-matching`) es "ARROZ", con exactamente 5 variantes
   * ("ARROZ BASMATI/FEDERAL/DOÑA PEPA/PARA SUSHI/BLANCO EXCELSO 500G") —
   * un límite más bajo (4) alcanzaba a cortar una de ellas.
   */
  findByNamePrefix(
    normalizedPrefix: string,
    excludeId: string,
    limit = 5,
  ): Promise<Articulo[]> {
    return this.prisma.$queryRaw<Articulo[]>`
      SELECT a.*
      FROM articulos a
      WHERE a.id != ${excludeId}
        AND public.f_unaccent(lower(a.nombre)) LIKE ${normalizedPrefix + ' %'}
      ORDER BY length(a.nombre) ASC, a.nombre ASC
      LIMIT ${limit}
    `;
  }

  /**
   * Upsert masivo por `sku` (si existe) o `nombre` (catálogo maestro).
   *
   * Optimizado en 2 fases para eliminar la latencia N+1:
   * 1. Precarga en lote (1 sola consulta SELECT `findMany`) de todos los registros
   *    existentes que coincidan por `sku` o `nombre`.
   * 2. Mapeo en memoria y ejecución de todas las operaciones (update/create)
   *    dentro de un solo bloque `$transaction` de Prisma.
   */
  async upsertMany(rows: ArticuloUpsertInput[]): Promise<number> {
    if (rows.length === 0) return 0;

    const skus = rows.map((r) => r.sku).filter((s): s is string => Boolean(s));
    const nombres = rows.map((r) => r.nombre);

    const existencias = await this.prisma.articulo.findMany({
      where: {
        OR: [
          ...(skus.length > 0 ? [{ sku: { in: skus } }] : []),
          { nombre: { in: nombres } },
        ],
      },
    });

    const porSku = new Map<string, Articulo>();
    const porNombre = new Map<string, Articulo>();

    for (const item of existencias) {
      if (item.sku) porSku.set(item.sku, item);
      porNombre.set(item.nombre, item);
    }

    const ops: Prisma.PrismaPromise<unknown>[] = [];

    for (const row of rows) {
      const existing =
        (row.sku ? porSku.get(row.sku) : undefined) ??
        porNombre.get(row.nombre);

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
        ops.push(
          this.prisma.articulo.update({ where: { id: existing.id }, data }),
        );
      } else {
        ops.push(this.prisma.articulo.create({ data }));
      }
    }

    // Una sola transacción para las ~938 filas del catálogo real superaba el
    // timeout (confirmado en producción: 120362ms vs. 120000ms de límite,
    // rollback completo). Se parte en lotes con su propia transacción corta
    // cada uno — si un lote falla, los anteriores ya quedaron confirmados en
    // vez de perder el import completo por una sola fila lenta.
    const LOTE = 100;
    for (let i = 0; i < ops.length; i += LOTE) {
      await this.prisma.$transaction(ops.slice(i, i + LOTE), {
        timeout: 30000,
      });
    }
    return rows.length;
  }
}
