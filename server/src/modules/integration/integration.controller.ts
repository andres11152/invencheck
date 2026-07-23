import {
  Body,
  Controller,
  HttpCode,
  Logger,
  ParseArrayPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ArticuloRepository } from '../articulos/articulo.repository';
import { AlmacenRepository } from '../almacenes/almacen.repository';
import { SyncArticuloItemDto } from './dto/sync-articulo-item.dto';
import { SyncAlmacenItemDto } from './dto/sync-almacen-item.dto';
import { ApiKeyGuard } from './guards/api-key.guard';
import { Public } from '../auth/decorators/public.decorator';

interface MockErpInventarioPayload {
  almacen?: { codigo?: string; nombre?: string };
  items?: unknown[];
}

@Controller('integration')
export class IntegrationController {
  private readonly logger = new Logger(IntegrationController.name);

  constructor(
    private readonly articuloRepository: ArticuloRepository,
    private readonly almacenRepository: AlmacenRepository,
  ) {}

  @Public()
  @UseGuards(ApiKeyGuard)
  @Post('webhook/sync-articulo')
  @HttpCode(200)
  async syncArticulos(
    @Body(new ParseArrayPipe({ items: SyncArticuloItemDto }))
    items: SyncArticuloItemDto[],
  ) {
    const upsertRows = items.map((item) => ({
      sku: item.sku ?? null,
      nombre: item.nombre,
      aliases: item.aliases ?? [],
      categoria: item.categoria,
      unidadEstd: item.unidadEstd,
      esProcesado: item.esProcesado ?? false,
      stockHistoricoAvg: item.stockHistoricoAvg ?? null,
    }));

    const count = await this.articuloRepository.upsertMany(upsertRows);
    return {
      success: true,
      message: `Sincronizados ${count} artículos desde el ERP.`,
    };
  }

  @Public()
  @UseGuards(ApiKeyGuard)
  @Post('webhook/sync-almacen')
  @HttpCode(200)
  async syncAlmacenes(
    @Body(new ParseArrayPipe({ items: SyncAlmacenItemDto }))
    items: SyncAlmacenItemDto[],
  ) {
    const count = await this.almacenRepository.upsertMany(items);
    return {
      success: true,
      message: `Sincronizados ${count} almacenes desde el ERP.`,
    };
  }

  @Public()
  @Post('mock-erp/receive-inventario')
  @HttpCode(200)
  receiveInventarioMock(@Body() payload: MockErpInventarioPayload) {
    const txRef = `ERP-TX-${Math.floor(Math.random() * 900000) + 100000}`;
    this.logger.log('[MOCK ERP] Recibiendo datos de toma física...');
    this.logger.log(
      `[MOCK ERP] Almacén: ${payload.almacen?.nombre} (Código: ${payload.almacen?.codigo})`,
    );
    this.logger.log(
      `[MOCK ERP] Cantidad de ítems contados: ${payload.items?.length}`,
    );
    this.logger.log(`[MOCK ERP] Transacción generada: ${txRef}`);
    return {
      success: true,
      message:
        'Líneas de inventario procesadas correctamente en base de datos ERP.',
      transactionRef: txRef,
    };
  }
}
