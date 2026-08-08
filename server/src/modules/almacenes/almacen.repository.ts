import { Inject, Injectable } from '@nestjs/common';
import { ContextoOrganizacionService } from '../../prisma/contexto-organizacion.service';
import { PRISMA_ORG, type PrismaConAlcance } from '../../prisma/prisma.module';
import type { Almacen } from '../../generated/prisma/client';

export interface AlmacenUpsertInput {
  codigo: string;
  nombre: string;
  unidad: string;
}

@Injectable()
export class AlmacenRepository {
  constructor(
    @Inject(PRISMA_ORG) private readonly prisma: PrismaConAlcance,
    private readonly contexto: ContextoOrganizacionService,
  ) {}

  findAll(params: { unidad?: string } = {}): Promise<Almacen[]> {
    return this.prisma.almacen.findMany({
      where: params.unidad ? { unidad: params.unidad } : undefined,
      orderBy: { nombre: 'asc' },
    });
  }

  findById(id: string): Promise<Almacen | null> {
    return this.prisma.almacen.findUnique({ where: { id } });
  }

  count(): Promise<number> {
    return this.prisma.almacen.count();
  }

  /**
   * Upsert por `codigo` — pero `codigo` solo es único DENTRO de la
   * organización actual, así que la clave real del upsert es el índice
   * compuesto `organizacionId_codigo`. La extensión de Prisma
   * deliberadamente NO toca el `where` de un `upsert` (ver el comentario en
   * `extensionAlcanceOrganizacion`), así que acá se arma a mano.
   */
  async upsertMany(rows: AlmacenUpsertInput[]): Promise<number> {
    if (rows.length === 0) return 0;
    const organizacionId = this.contexto.actual()?.organizacionId;
    if (!organizacionId) {
      throw new Error('upsertMany requiere un alcance de organización abierto');
    }

    const ops = rows.map((row) =>
      this.prisma.almacen.upsert({
        where: {
          organizacionId_codigo: { organizacionId, codigo: row.codigo },
        },
        update: { nombre: row.nombre, unidad: row.unidad },
        create: { ...row, organizacionId },
      }),
    );
    await this.prisma.$transaction(ops, { timeout: 60000 });
    return rows.length;
  }
}
