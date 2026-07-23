import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Almacen } from '../../generated/prisma/client';

export interface AlmacenUpsertInput {
  codigo: string;
  nombre: string;
  unidad: string;
}

@Injectable()
export class AlmacenRepository {
  constructor(private readonly prisma: PrismaService) {}

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

  /** Upsert por `codigo` (clave estable del catálogo de bodegas). */
  async upsertMany(rows: AlmacenUpsertInput[]): Promise<number> {
    for (const row of rows) {
      await this.prisma.almacen.upsert({
        where: { codigo: row.codigo },
        update: { nombre: row.nombre, unidad: row.unidad },
        create: row,
      });
    }
    return rows.length;
  }
}
