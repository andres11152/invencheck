import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InventarioService } from './inventario.service';
import type { InventarioRepository } from './inventario.repository';
import type { AlmacenRepository } from '../almacenes/almacen.repository';
import type { ArticuloService } from '../articulos/articulo.service';
import type { AiEngineService } from '../ai-engine/ai-engine.service';
import type { AnomaliasService } from './services/anomalias.service';
import type { IntegrationErpService } from '../integration/integration-erp.service';
import {
  EstadoInventario,
  UnidadMedida,
  type Articulo,
  type Inventario,
} from '../../generated/prisma/client';

function buildInventario(overrides: Partial<Inventario> = {}): Inventario {
  return {
    id: 'inv-1',
    almacenId: 'alm-1',
    usuarioId: 'user-1',
    auditorId: null,
    estado: EstadoInventario.BORRADOR,
    fechaCorte: new Date(),
    auditaAId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('InventarioService.cambiarEstado', () => {
  function buildService(opts: {
    findById?: jest.Mock;
    contarAlertasActivas?: jest.Mock;
    cambiarEstado?: jest.Mock;
    enviarInventarioAERP?: jest.Mock;
  }) {
    const inventarioRepository = {
      findById: opts.findById ?? jest.fn().mockResolvedValue(buildInventario()),
      contarAlertasActivas:
        opts.contarAlertasActivas ?? jest.fn().mockResolvedValue(0),
      cambiarEstado:
        opts.cambiarEstado ?? jest.fn().mockResolvedValue(buildInventario()),
    } as unknown as InventarioRepository;
    const integrationErpService = {
      enviarInventarioAERP:
        opts.enviarInventarioAERP ??
        jest.fn().mockResolvedValue({ success: true, ref: 'x' }),
    } as unknown as IntegrationErpService;

    return new InventarioService(
      inventarioRepository,
      {} as unknown as AlmacenRepository,
      {} as unknown as ArticuloService,
      {} as unknown as AiEngineService,
      {} as unknown as AnomaliasService,
      integrationErpService,
    );
  }

  it('lanza 404 si el inventario no existe', async () => {
    const service = buildService({
      findById: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.cambiarEstado('no-existe', EstadoInventario.CONCILIADO),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza cualquier cambio si el inventario ya fue ENVIADO_ERP (estado inmutable)', async () => {
    const service = buildService({
      findById: jest
        .fn()
        .mockResolvedValue(
          buildInventario({ estado: EstadoInventario.ENVIADO_ERP }),
        ),
    });

    await expect(
      service.cambiarEstado('inv-1', EstadoInventario.EN_AUDITORIA),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bloquea la transición a CONCILIADO si hay alertas activas sin resolver', async () => {
    const cambiarEstado = jest.fn();
    const service = buildService({
      contarAlertasActivas: jest.fn().mockResolvedValue(2),
      cambiarEstado,
    });

    await expect(
      service.cambiarEstado('inv-1', EstadoInventario.CONCILIADO),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(cambiarEstado).not.toHaveBeenCalled();
  });

  it('permite CONCILIADO cuando no quedan alertas activas', async () => {
    const cambiarEstado = jest
      .fn()
      .mockResolvedValue(
        buildInventario({ estado: EstadoInventario.CONCILIADO }),
      );
    const service = buildService({
      contarAlertasActivas: jest.fn().mockResolvedValue(0),
      cambiarEstado,
    });

    const result = await service.cambiarEstado(
      'inv-1',
      EstadoInventario.CONCILIADO,
    );

    expect(cambiarEstado).toHaveBeenCalledWith(
      'inv-1',
      EstadoInventario.CONCILIADO,
    );
    expect(result.estado).toBe(EstadoInventario.CONCILIADO);
  });

  it('no revisa alertas activas para transiciones que no son CONCILIADO/ENVIADO_ERP', async () => {
    const contarAlertasActivas = jest.fn().mockResolvedValue(5);
    const cambiarEstado = jest.fn().mockResolvedValue(buildInventario());
    const service = buildService({ contarAlertasActivas, cambiarEstado });

    await service.cambiarEstado('inv-1', EstadoInventario.EN_AUDITORIA);

    expect(contarAlertasActivas).not.toHaveBeenCalled();
    expect(cambiarEstado).toHaveBeenCalledWith(
      'inv-1',
      EstadoInventario.EN_AUDITORIA,
    );
  });

  it('ENVIADO_ERP delega en IntegrationErpService en vez de escribir el estado directamente', async () => {
    const enviarInventarioAERP = jest
      .fn()
      .mockResolvedValue({ success: true, ref: 'x' });
    const cambiarEstado = jest.fn();
    const findById = jest
      .fn()
      .mockResolvedValueOnce(buildInventario())
      .mockResolvedValueOnce(
        buildInventario({ estado: EstadoInventario.ENVIADO_ERP }),
      );
    const service = buildService({
      findById,
      contarAlertasActivas: jest.fn().mockResolvedValue(0),
      cambiarEstado,
      enviarInventarioAERP,
    });

    const result = await service.cambiarEstado(
      'inv-1',
      EstadoInventario.ENVIADO_ERP,
    );

    expect(enviarInventarioAERP).toHaveBeenCalledWith('inv-1');
    expect(cambiarEstado).not.toHaveBeenCalled();
    expect(result.estado).toBe(EstadoInventario.ENVIADO_ERP);
  });
});

function buildArticulo(overrides: Partial<Articulo> = {}): Articulo {
  return {
    id: 'art-1',
    sku: null,
    nombre: 'ARTICULO TEST',
    aliases: [],
    categoria: 'Test',
    unidadEstd: UnidadMedida.UNIDAD,
    esProcesado: false,
    stockHistoricoAvg: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('InventarioService.procesarTomaPorVoz — motivo de itemsNoMatcheados', () => {
  function buildService(normalizarEntradaHablada: jest.Mock) {
    const inventarioRepository = {
      findById: jest.fn().mockResolvedValue(buildInventario()),
      findDetalleById: jest.fn().mockResolvedValue(buildInventario()),
    } as unknown as InventarioRepository;
    const articuloService = {
      normalizarEntradaHablada,
    } as unknown as ArticuloService;
    const aiEngineService = {
      procesarDictadoVoz: jest.fn().mockResolvedValue({
        items: [
          {
            articuloBusqueda: 'cebolla cabezona',
            cantidad: 1,
            unidadDictada: UnidadMedida.UNIDAD,
          },
        ],
        fuente: 'REGLAS_LOCALES',
      }),
    } as unknown as AiEngineService;

    return new InventarioService(
      inventarioRepository,
      {} as unknown as AlmacenRepository,
      articuloService,
      aiEngineService,
      {} as unknown as AnomaliasService,
      {} as unknown as IntegrationErpService,
    );
  }

  it('reporta el motivo genérico cuando no hay ningún candidato', async () => {
    const service = buildService(
      jest.fn().mockResolvedValue({
        textoNormalizado: 'cebolla cabezona',
        articulo: null,
        score: 0,
      }),
    );

    const resultado = await service.procesarTomaPorVoz(
      'inv-1',
      'cebolla cabezona',
    );

    expect(resultado.itemsMatcheados).toHaveLength(0);
    expect(resultado.itemsNoMatcheados).toHaveLength(1);
    expect(resultado.itemsNoMatcheados[0].motivo).toBe(
      'Sin coincidencia en el catálogo de artículos',
    );
  });

  it('reporta los candidatos ambiguos por nombre cuando ArticuloService detecta ambigüedad real', async () => {
    const rojo = buildArticulo({
      id: 'art-rojo',
      nombre: 'CEBOLLA CABEZONA ROJA',
    });
    const blanco = buildArticulo({
      id: 'art-blanco',
      nombre: 'CEBOLLA CABEZONA BLANCA',
    });
    const service = buildService(
      jest.fn().mockResolvedValue({
        textoNormalizado: 'cebolla cabezona',
        articulo: null,
        score: 1.25,
        candidatosAmbiguos: [rojo, blanco],
      }),
    );

    const resultado = await service.procesarTomaPorVoz(
      'inv-1',
      'cebolla cabezona',
    );

    expect(resultado.itemsMatcheados).toHaveLength(0);
    expect(resultado.itemsNoMatcheados).toHaveLength(1);
    expect(resultado.itemsNoMatcheados[0].motivo).toContain(
      'CEBOLLA CABEZONA ROJA',
    );
    expect(resultado.itemsNoMatcheados[0].motivo).toContain(
      'CEBOLLA CABEZONA BLANCA',
    );
    expect(resultado.itemsNoMatcheados[0].motivo).toContain(
      'sé más específico',
    );
  });
});
