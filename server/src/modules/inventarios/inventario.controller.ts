import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { InventarioService } from './inventario.service';
import { CrearInventarioDto } from './dto/crear-inventario.dto';
import { ProcesarVozDto } from './dto/procesar-voz.dto';
import { ProcesarSkuDto } from './dto/procesar-sku.dto';
import { ProcesarArticuloDto } from './dto/procesar-articulo.dto';
import { DeshacerConteoDto } from './dto/deshacer-conteo.dto';
import { CambiarEstadoDto } from './dto/cambiar-estado.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolUsuario, UnidadMedida } from '../../generated/prisma/client';
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

  // Entrada por SKU exacto (escáner de código de barras) — no pasa por el
  // matching difuso de `procesar-voz`, ver el comentario en
  // InventarioService.procesarConteoPorSku.
  @Post(':id/procesar-sku')
  procesarSku(@Param('id') id: string, @Body() dto: ProcesarSkuDto) {
    return this.inventarioService.procesarConteoPorSku(
      id,
      dto.sku,
      dto.cantidad,
      dto.unidadDictada ?? UnidadMedida.UNIDAD,
    );
  }

  // Selección manual directa entre los `candidatos` de una ambigüedad de
  // voz — ver el comentario en InventarioService.procesarConteoPorArticulo
  // sobre por qué re-dictar no alcanza cuando un candidato es prefijo
  // exacto de otro ("PAPA CRIOLLA" / "PAPA CRIOLLA PRECOCIDA").
  @Post(':id/procesar-articulo')
  procesarArticulo(@Param('id') id: string, @Body() dto: ProcesarArticuloDto) {
    return this.inventarioService.procesarConteoPorArticulo(
      id,
      dto.articuloId,
      dto.cantidad,
      dto.unidadDictada ?? UnidadMedida.UNIDAD,
    );
  }

  // "Re-dictar / Corregir" en el modal de anomalía: deshace la última
  // cantidad dictada para este artículo (en vez de acumularla, que es lo
  // que procesar-voz/procesar-sku SÍ deben hacer siempre) — ver el
  // comentario en InventarioService.deshacerUltimoConteo.
  @Patch(':id/articulos/:articuloId/deshacer-conteo')
  deshacerConteo(
    @Param('id') id: string,
    @Param('articuloId') articuloId: string,
    @Body() dto: DeshacerConteoDto,
  ) {
    return this.inventarioService.deshacerUltimoConteo(
      id,
      articuloId,
      dto.cantidadDictada,
      dto.unidadDictada,
    );
  }

  // Consolidar/enviar a ERP es una acción de cierre supervisado: quien contó
  // (OPERARIO) no se autoaprueba — segregación de funciones clásica en
  // procesos de inventario/auditoría.
  @Roles(RolUsuario.AUDITOR, RolUsuario.ADMIN)
  @Patch(':id/estado')
  cambiarEstado(@Param('id') id: string, @Body() dto: CambiarEstadoDto) {
    return this.inventarioService.cambiarEstado(id, dto.estado);
  }

  // Auto-chequeo del operario que dictó (confirma que la cantidad no fue un
  // error de dictado) — deliberadamente SIN @Roles, ver el comentario en
  // InventarioService.resolverAlerta. NO es el gate de auditoría: ya no
  // alcanza por sí solo para desbloquear cambiarEstado, ver `revisarAlerta`.
  @Patch(':id/alertas/:alertaId/resolver')
  resolverAlerta(@Param('id') id: string, @Param('alertaId') alertaId: string) {
    return this.inventarioService.resolverAlerta(id, alertaId);
  }

  // Este es el gate real de segregación de funciones para las alertas: solo
  // un AUDITOR/ADMIN puede revisarlas. Antes de este cambio no existía este
  // endpoint y `resolverAlerta` (sin rol) era el único mecanismo — cualquier
  // OPERARIO podía cerrar su propia anomalía sin revisión independiente.
  @Roles(RolUsuario.AUDITOR, RolUsuario.ADMIN)
  @Patch(':id/alertas/:alertaId/revisar')
  revisarAlerta(
    @Param('id') id: string,
    @Param('alertaId') alertaId: string,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.inventarioService.revisarAlerta(id, alertaId, usuario.id);
  }

  @Roles(RolUsuario.AUDITOR, RolUsuario.ADMIN)
  @Post(':id/auditoria-ciega')
  crearAuditoriaCiega(
    @Param('id') id: string,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.inventarioService.crearAuditoriaCiega(id, usuario.id);
  }

  // Ver la comparación revela el conteo del auditor de la auditoría ciega —
  // restringido igual que crearAuditoriaCiega, para que el operario original
  // no pueda consultarlo mientras la auditoría sigue en curso.
  @Roles(RolUsuario.AUDITOR, RolUsuario.ADMIN)
  @Get(':id/comparacion-auditoria')
  compararAuditoria(@Param('id') id: string) {
    return this.inventarioService.compararAuditoria(id);
  }
}
