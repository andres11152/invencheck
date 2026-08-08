import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PRISMA_ORG, type PrismaConAlcance } from '../../prisma/prisma.module';
import type { Usuario } from '../../generated/prisma/client';

@Injectable()
export class UsuarioRepository {
  constructor(
    /** Cliente SIN alcance — necesario para `findByEmail`, ver el comentario ahí. */
    private readonly prisma: PrismaService,
    @Inject(PRISMA_ORG) private readonly prismaOrg: PrismaConAlcance,
  ) {}

  /**
   * Único lookup legítimamente cross-tenant del camino de request: en el
   * login todavía no se conoce la organización — al contrario, `email` (único
   * a nivel GLOBAL, por la decisión de producto de "un usuario = una
   * organización") es la única forma de DESCUBRIRLA. Por eso usa el cliente
   * SIN alcance, envuelto explícitamente en `sinAlcanceDeOrganizacion`.
   */
  findByEmail(email: string): Promise<Usuario | null> {
    return this.prisma.sinAlcanceDeOrganizacion(
      'login: resolver organización desde email global',
      () => this.prisma.usuario.findUnique({ where: { email } }),
    );
  }

  /**
   * A diferencia de `findByEmail`, esta SÍ es una consulta scoped normal:
   * `JwtStrategy.validate` ya fijó la organización desde el claim del token
   * antes de llamar acá, así que de paso confirma que el usuario sigue
   * perteneciendo a esa organización (si fue movido o borrado, esto no lo
   * encuentra y el 401 sale solo).
   */
  findById(id: string): Promise<Usuario | null> {
    return this.prismaOrg.usuario.findUnique({ where: { id } });
  }
}
