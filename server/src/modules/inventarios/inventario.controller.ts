import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { InventarioService } from './inventario.service';
import { CrearInventarioDto } from './dto/crear-inventario.dto';
import { ProcesarVozDto } from './dto/procesar-voz.dto';
import { CambiarEstadoDto } from './dto/cambiar-estado.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolUsuario } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';

@Controller('inventarios')
export class InventarioController {
  constructor(private readonly inventarioService: InventarioService) {}

  @Post()
  crear(
    @Body() dto: CrearInventarioDto,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.inventarioService.crear({
      almacenId: dto.almacenId,
      usuarioId: usuario.id,
      fechaCorte: dto.fechaCorte ? new Date(dto.fechaCorte) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.inventarioService.findDetalle(id);
  }

  @Post(':id/procesar-voz')
  procesarVoz(@Param('id') id: string, @Body() dto: ProcesarVozDto) {
    return this.inventarioService.procesarTomaPorVoz(id, dto.texto);
  }

  // Consolidar/enviar a ERP es una acción de cierre supervisado: quien contó
  // (OPERARIO) no se autoaprueba — segregación de funciones clásica en
  // procesos de inventario/auditoría.
  @Roles(RolUsuario.AUDITOR, RolUsuario.ADMIN)
  @Patch(':id/estado')
  cambiarEstado(@Param('id') id: string, @Body() dto: CambiarEstadoDto) {
    return this.inventarioService.cambiarEstado(id, dto.estado);
  }

  @Patch(':id/alertas/:alertaId/resolver')
  resolverAlerta(@Param('id') id: string, @Param('alertaId') alertaId: string) {
    return this.inventarioService.resolverAlerta(id, alertaId);
  }

  @Roles(RolUsuario.AUDITOR, RolUsuario.ADMIN)
  @Post(':id/auditoria-ciega')
  crearAuditoriaCiega(
    @Param('id') id: string,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.inventarioService.crearAuditoriaCiega(id, usuario.id);
  }

  @Get(':id/comparacion-auditoria')
  compararAuditoria(@Param('id') id: string) {
    return this.inventarioService.compararAuditoria(id);
  }
}
