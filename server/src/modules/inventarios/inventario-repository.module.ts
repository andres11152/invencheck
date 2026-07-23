import { Module } from '@nestjs/common';
import { InventarioRepository } from './inventario.repository';

/**
 * Separado de InventariosModule para que IntegrationModule pueda depender
 * solo del repositorio (lo único que necesita) sin importar el módulo
 * completo de inventarios — eso es lo que causaba el ciclo InventariosModule
 * ↔ IntegrationModule que antes se resolvía con forwardRef() + ModuleRef.
 */
@Module({
  providers: [InventarioRepository],
  exports: [InventarioRepository],
})
export class InventarioRepositoryModule {}
