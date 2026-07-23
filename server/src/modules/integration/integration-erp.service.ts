import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InventarioRepository } from '../inventarios/inventario.repository';
import { EstadoInventario } from '../../generated/prisma/client';

@Injectable()
export class IntegrationErpService {
  private readonly logger = new Logger(IntegrationErpService.name);
  private readonly erpUrl =
    process.env.ERP_INTEGRATION_URL ??
    'http://localhost:3000/api/integration/mock-erp/receive-inventario';

  constructor(private readonly inventarioRepository: InventarioRepository) {}

  async enviarInventarioAERP(
    id: string,
  ): Promise<{ success: boolean; ref: string }> {
    this.logger.log(`Iniciando envío de inventario ${id} al ERP...`);
    const inventario = await this.inventarioRepository.findDetalleById(id);
    if (!inventario) {
      throw new NotFoundException(`Inventario ${id} no encontrado`);
    }

    // Calcular merma: conteoFisico - teorico
    const payload = {
      inventarioId: inventario.id,
      almacen: {
        codigo: inventario.almacen.codigo,
        nombre: inventario.almacen.nombre,
      },
      fechaCorte: inventario.fechaCorte,
      estado: 'ENVIADO_ERP',
      items: inventario.items.map((item) => ({
        sku: item.articulo.sku,
        nombre: item.articulo.nombre,
        unidad: item.unidadUsada,
        teorico: item.teorico,
        conteoFisico: item.conteoFisico,
        merma: Math.round((item.conteoFisico - item.teorico) * 100) / 100,
        esAnomalia: item.esAnomalia,
      })),
    };

    try {
      const response = await fetch(this.erpUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(
          `ERP respondió con código ${response.status}: ${await response.text()}`,
        );
      }

      const resData = (await response.json()) as { transactionRef?: string };
      const ref =
        resData.transactionRef ??
        `ERP-TX-${Math.floor(Math.random() * 900000) + 100000}`;

      this.logger.log(
        `Inventario ${id} recibido por el ERP de forma exitosa. Ref: ${ref}`,
      );

      // Actualizar estado en base de datos local
      await this.inventarioRepository.cambiarEstado(
        id,
        EstadoInventario.ENVIADO_ERP,
      );

      return { success: true, ref };
    } catch (err) {
      this.logger.error(`Fallo al enviar inventario ${id} al ERP`, err);
      throw err;
    }
  }
}
