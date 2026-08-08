import { Global, Module } from '@nestjs/common';
import { ContextoOrganizacionService } from './contexto-organizacion.service';
import { extensionAlcanceOrganizacion } from './extension-alcance-organizacion';
import { PrismaService } from './prisma.service';

/** Token del cliente de Prisma AUTO-SCOPED por organización. Ver el comentario en `construirClienteConAlcance`. */
export const PRISMA_ORG = Symbol('PRISMA_ORG');

/**
 * Un solo `$extends` al arrancar la app, no uno por request: la extensión
 * lee la organización de `AsyncLocalStorage` en cada llamada (ver
 * `extensionAlcanceOrganizacion`), así que el cliente resultante puede ser
 * singleton — ningún provider necesita `Scope.REQUEST`.
 */
function construirClienteConAlcance(
  base: PrismaService,
  contexto: ContextoOrganizacionService,
) {
  return base.$extends(extensionAlcanceOrganizacion(contexto));
}

export type PrismaConAlcance = ReturnType<typeof construirClienteConAlcance>;

@Global()
@Module({
  providers: [
    ContextoOrganizacionService,
    PrismaService,
    {
      provide: PRISMA_ORG,
      inject: [PrismaService, ContextoOrganizacionService],
      useFactory: construirClienteConAlcance,
    },
  ],
  exports: [ContextoOrganizacionService, PrismaService, PRISMA_ORG],
})
export class PrismaModule {}
