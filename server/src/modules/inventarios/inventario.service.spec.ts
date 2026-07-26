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
  TipoAlerta,
  UnidadMedida,
  type AlertaInventario,
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

function buildAlerta(
  overrides: Partial<AlertaInventario> = {},
): AlertaInventario {
  return {
    id: 'alerta-1',
    inventarioId: 'inv-1',
    itemInventarioId: 'item-1',
    tipo: TipoAlerta.ANOMALIA_CANTIDAD,
    mensaje: 'Conteo se desvía 900% del histórico',
    resuelto: false,
    revisadoPorAuditor: false,
    revisadoPor: null,
    revisadoEn: null,
    createdAt: new Date(),
    ...overrides,
  };
}

// Auto-chequeo del operario (`resolverAlerta`, sin restricción de rol) vs. el
// gate real de auditoría (`revisarAlerta`, restringido a AUDITOR/ADMIN por
// `@Roles` en el controller, no acá) — regresión del hallazgo de que un
// OPERARIO podía auto-resolver su propia anomalía sin ninguna revisión
// independiente.
describe('InventarioService.resolverAlerta / revisarAlerta', () => {
  function buildService(opts: {
    findAlerta?: jest.Mock;
    resolverAlerta?: jest.Mock;
    revisarAlerta?: jest.Mock;
  }) {
    const inventarioRepository = {
      findAlerta: opts.findAlerta ?? jest.fn().mockResolvedValue(buildAlerta()),
      resolverAlerta:
        opts.resolverAlerta ??
        jest.fn().mockResolvedValue(buildAlerta({ resuelto: true })),
      revisarAlerta:
        opts.revisarAlerta ??
        jest
          .fn()
          .mockResolvedValue(
            buildAlerta({ revisadoPorAuditor: true, revisadoPor: 'auditor-1' }),
          ),
    } as unknown as InventarioRepository;

    return new InventarioService(
      inventarioRepository,
      {} as unknown as AlmacenRepository,
      {} as unknown as ArticuloService,
      {} as unknown as AiEngineService,
      {} as unknown as AnomaliasService,
      {} as unknown as IntegrationErpService,
    );
  }

  it('resolverAlerta lanza 404 si la alerta no existe', async () => {
    const service = buildService({
      findAlerta: jest.fn().mockResolvedValue(null),
    });
    await expect(service.resolverAlerta('inv-1', 'no-existe')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('resolverAlerta lanza 404 si la alerta pertenece a otro inventario', async () => {
    const service = buildService({
      findAlerta: jest
        .fn()
        .mockResolvedValue(buildAlerta({ inventarioId: 'otro-inventario' })),
    });
    await expect(service.resolverAlerta('inv-1', 'alerta-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('resolverAlerta delega en el repositorio cuando la alerta pertenece al inventario', async () => {
    const resolverAlerta = jest
      .fn()
      .mockResolvedValue(buildAlerta({ resuelto: true }));
    const service = buildService({ resolverAlerta });

    const result = await service.resolverAlerta('inv-1', 'alerta-1');

    expect(resolverAlerta).toHaveBeenCalledWith('alerta-1');
    expect(result.resuelto).toBe(true);
  });

  it('revisarAlerta lanza 404 si la alerta no existe', async () => {
    const service = buildService({
      findAlerta: jest.fn().mockResolvedValue(null),
    });
    await expect(
      service.revisarAlerta('inv-1', 'no-existe', 'auditor-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('revisarAlerta lanza 404 si la alerta pertenece a otro inventario', async () => {
    const service = buildService({
      findAlerta: jest
        .fn()
        .mockResolvedValue(buildAlerta({ inventarioId: 'otro-inventario' })),
    });
    await expect(
      service.revisarAlerta('inv-1', 'alerta-1', 'auditor-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('revisarAlerta delega en el repositorio pasando el id del auditor', async () => {
    const revisarAlerta = jest
      .fn()
      .mockResolvedValue(
        buildAlerta({ revisadoPorAuditor: true, revisadoPor: 'auditor-1' }),
      );
    const service = buildService({ revisarAlerta });

    const result = await service.revisarAlerta(
      'inv-1',
      'alerta-1',
      'auditor-1',
    );

    expect(revisarAlerta).toHaveBeenCalledWith('alerta-1', 'auditor-1');
    expect(result.revisadoPorAuditor).toBe(true);
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
    // Regresión de un bug real reportado: el consejo era un genérico fijo
    // ("sé más específico: color, tamaño o cantidad exacta") sin importar
    // cuál fuera la ambigüedad real — un operario que re-dictaba la misma
    // frase ambigua siguiendo ese consejo quedaba en loop porque nunca se
    // le decía la palabra concreta que faltaba. Ahora debe nombrar la
    // palabra distintiva real de cada candidato.
    expect(resultado.itemsNoMatcheados[0].motivo).toContain('agrega "roja"');
    expect(resultado.itemsNoMatcheados[0].motivo).toContain('agrega "blanca"');
    expect(resultado.itemsNoMatcheados[0].motivo).not.toContain(
      'color, tamaño',
    );
  });

  it('cuando un candidato es prefijo exacto del otro, aclara que ese se dicta tal cual sin agregar nada (bug real: "papa criolla" vs. "papa criolla precocida")', async () => {
    const cruda = buildArticulo({ id: 'art-cruda', nombre: 'PAPA CRIOLLA' });
    const precocida = buildArticulo({
      id: 'art-precocida',
      nombre: 'PAPA CRIOLLA PRECOCIDA',
    });
    const service = buildService(
      jest.fn().mockResolvedValue({
        textoNormalizado: 'papa criolla',
        articulo: null,
        score: 1.25,
        candidatosAmbiguos: [cruda, precocida],
      }),
    );

    const resultado = await service.procesarTomaPorVoz('inv-1', 'papa criolla');

    const motivo = resultado.itemsNoMatcheados[0].motivo;
    expect(motivo).toContain(
      'agrega "precocida" si es "PAPA CRIOLLA PRECOCIDA"',
    );
    expect(motivo).toContain(
      'dilo tal cual, sin agregar nada, si es "PAPA CRIOLLA"',
    );
  });
});

// Regresión de un hallazgo de la auditoría de arquitectura: la secuencia de
// escritura de un conteo (incrementar/sembrar, evaluar anomalía, crear
// alertas, resolver las superadas) eran ~5 escrituras sueltas en secuencia,
// sin ninguna transacción — un fallo a mitad de camino podía dejar el ítem
// y sus alertas inconsistentes entre sí. Ahora corren dentro de
// `InventarioRepository.ejecutarEnTransaccion`, con el mismo patrón que ya
// usaba `crearAuditoriaCiega`.
describe('InventarioService.procesarTomaPorVoz — transaccionalidad de escritura', () => {
  const TX_MARCADOR = { esLaTransaccion: true };

  function buildService(opts: {
    incrementarConteo?: jest.Mock;
    actualizarEsAnomalia?: jest.Mock;
    crearAlertas?: jest.Mock;
    resolverAlertasSuperadas?: jest.Mock;
    ejecutarEnTransaccion?: jest.Mock;
  }) {
    const itemInventario = {
      id: 'item-1',
      inventarioId: 'inv-1',
      articuloId: 'art-1',
      teorico: 10,
      conteoFisico: 5,
      unidadUsada: UnidadMedida.KILOGRAMO,
      esAnomalia: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const ejecutarEnTransaccion =
      opts.ejecutarEnTransaccion ??
      jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(TX_MARCADOR));

    const inventarioRepository = {
      findById: jest.fn().mockResolvedValue(buildInventario()),
      findDetalleById: jest.fn().mockResolvedValue(buildInventario()),
      ejecutarEnTransaccion,
      incrementarConteo:
        opts.incrementarConteo ?? jest.fn().mockResolvedValue(itemInventario),
      promedioHistoricoPorAlmacen: jest.fn().mockResolvedValue(null),
      actualizarEsAnomalia:
        opts.actualizarEsAnomalia ??
        jest.fn().mockResolvedValue(itemInventario),
      crearAlertas: opts.crearAlertas ?? jest.fn().mockResolvedValue(0),
      resolverAlertasSuperadas:
        opts.resolverAlertasSuperadas ?? jest.fn().mockResolvedValue(0),
    } as unknown as InventarioRepository;

    const articuloService = {
      normalizarEntradaHablada: jest.fn().mockResolvedValue({
        textoNormalizado: 'papa criolla',
        articulo: buildArticulo({
          id: 'art-1',
          nombre: 'PAPA CRIOLLA',
          unidadEstd: UnidadMedida.KILOGRAMO,
        }),
        score: 1,
      }),
    } as unknown as ArticuloService;
    const aiEngineService = {
      procesarDictadoVoz: jest.fn().mockResolvedValue({
        items: [
          {
            articuloBusqueda: 'papa criolla',
            cantidad: 5,
            unidadDictada: UnidadMedida.KILOGRAMO,
          },
        ],
        fuente: 'REGLAS_LOCALES',
      }),
    } as unknown as AiEngineService;
    const anomaliasService = {
      evaluarConteo: jest.fn().mockReturnValue({
        conteoFisico: 5,
        unidadUsada: UnidadMedida.KILOGRAMO,
        esAnomalia: false,
        alertas: [],
      }),
    } as unknown as AnomaliasService;

    return new InventarioService(
      inventarioRepository,
      {} as unknown as AlmacenRepository,
      articuloService,
      aiEngineService,
      anomaliasService,
      {} as unknown as IntegrationErpService,
    );
  }

  it('corre toda la secuencia de escritura dentro de ejecutarEnTransaccion', async () => {
    const ejecutarEnTransaccion = jest.fn(
      (fn: (tx: unknown) => Promise<unknown>) => fn(TX_MARCADOR),
    );
    const service = buildService({ ejecutarEnTransaccion });

    await service.procesarTomaPorVoz('inv-1', '5 kilos de papa criolla');

    expect(ejecutarEnTransaccion).toHaveBeenCalledTimes(1);
  });

  it('pasa el cliente de la transacción (no this.prisma directo) a cada escritura', async () => {
    const incrementarConteo = jest.fn().mockResolvedValue({
      id: 'item-1',
      inventarioId: 'inv-1',
      articuloId: 'art-1',
      teorico: 10,
      conteoFisico: 5,
      unidadUsada: UnidadMedida.KILOGRAMO,
      esAnomalia: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const actualizarEsAnomalia = jest.fn().mockResolvedValue({});
    const resolverAlertasSuperadas = jest.fn().mockResolvedValue(0);
    const service = buildService({
      incrementarConteo,
      actualizarEsAnomalia,
      resolverAlertasSuperadas,
    });

    await service.procesarTomaPorVoz('inv-1', '5 kilos de papa criolla');

    expect(incrementarConteo).toHaveBeenCalledWith(
      expect.any(Object),
      TX_MARCADOR,
    );
    expect(actualizarEsAnomalia).toHaveBeenCalledWith(
      'item-1',
      false,
      TX_MARCADOR,
    );
    expect(resolverAlertasSuperadas).toHaveBeenCalledWith(
      'item-1',
      [],
      TX_MARCADOR,
    );
  });

  it('si una escritura falla a mitad de la secuencia, el error se propaga (no queda "a medias" en silencio)', async () => {
    const actualizarEsAnomalia = jest
      .fn()
      .mockRejectedValue(new Error('timeout simulado de Postgres'));
    const service = buildService({ actualizarEsAnomalia });

    await expect(
      service.procesarTomaPorVoz('inv-1', '5 kilos de papa criolla'),
    ).rejects.toThrow('timeout simulado de Postgres');
  });
});

/**
 * Regresión de un bug real reportado (con capturas de producción):
 * "Re-dictar / Corregir" dejaba el conteo ACUMULADO en vez de reemplazado
 * — cada intento de corregir un dictado erróneo sumaba otra vez la
 * cantidad en vez de deshacer la anterior. `deshacerUltimoConteo` es lo
 * que el cliente llama antes de dejar redication, para restar el delta
 * exacto que causó la anomalía pendiente.
 */
describe('InventarioService.deshacerUltimoConteo', () => {
  const TX_MARCADOR = { esLaTransaccion: true };

  function buildService(opts: {
    findItem?: jest.Mock;
    incrementarConteo?: jest.Mock;
    articulo?: Articulo;
  }) {
    const articulo =
      opts.articulo ??
      buildArticulo({
        id: 'art-1',
        nombre: 'ARROZ DOÑA PEPA',
        unidadEstd: UnidadMedida.KILOGRAMO,
        stockHistoricoAvg: 5,
      });

    const itemInventario = {
      id: 'item-1',
      inventarioId: 'inv-1',
      articuloId: 'art-1',
      teorico: 5,
      conteoFisico: 0,
      unidadUsada: UnidadMedida.KILOGRAMO,
      esAnomalia: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const ejecutarEnTransaccion = jest.fn(
      (fn: (tx: unknown) => Promise<unknown>) => fn(TX_MARCADOR),
    );

    const inventarioRepository = {
      findById: jest.fn().mockResolvedValue(buildInventario()),
      findDetalleById: jest.fn().mockResolvedValue(buildInventario()),
      findItem:
        opts.findItem ??
        jest.fn().mockResolvedValue({ ...itemInventario, conteoFisico: 20 }),
      ejecutarEnTransaccion,
      incrementarConteo:
        opts.incrementarConteo ?? jest.fn().mockResolvedValue(itemInventario),
      promedioHistoricoPorAlmacen: jest.fn().mockResolvedValue(null),
      actualizarEsAnomalia: jest.fn().mockResolvedValue(itemInventario),
      crearAlertas: jest.fn().mockResolvedValue(0),
      resolverAlertasSuperadas: jest.fn().mockResolvedValue(0),
    } as unknown as InventarioRepository;

    const articuloService = {
      findById: jest.fn().mockResolvedValue(articulo),
    } as unknown as ArticuloService;
    const anomaliasService = {
      evaluarConteo: jest.fn().mockReturnValue({
        conteoFisico: 0,
        unidadUsada: UnidadMedida.KILOGRAMO,
        esAnomalia: true,
        alertas: [{ tipo: TipoAlerta.ANOMALIA_CANTIDAD, mensaje: 'x' }],
      }),
    } as unknown as AnomaliasService;

    return {
      service: new InventarioService(
        inventarioRepository,
        {} as unknown as AlmacenRepository,
        articuloService,
        {} as unknown as AiEngineService,
        anomaliasService,
        {} as unknown as IntegrationErpService,
      ),
      inventarioRepository,
      ejecutarEnTransaccion,
    };
  }

  it('resta el delta CONVERTIDO (negativo) en vez de sumarlo', async () => {
    const incrementarConteo = jest.fn().mockResolvedValue({
      id: 'item-1',
      inventarioId: 'inv-1',
      articuloId: 'art-1',
      teorico: 5,
      conteoFisico: 0,
      unidadUsada: UnidadMedida.KILOGRAMO,
      esAnomalia: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const { service } = buildService({ incrementarConteo });

    await service.deshacerUltimoConteo(
      'inv-1',
      'art-1',
      20,
      UnidadMedida.KILOGRAMO,
    );

    expect(incrementarConteo).toHaveBeenCalledWith(
      expect.objectContaining({ delta: -20 }),
      TX_MARCADOR,
    );
  });

  it('convierte la unidad antes de restar (ej. gramos -> kilogramos)', async () => {
    const incrementarConteo = jest.fn().mockResolvedValue({
      id: 'item-1',
      inventarioId: 'inv-1',
      articuloId: 'art-1',
      teorico: 5,
      conteoFisico: 0,
      unidadUsada: UnidadMedida.KILOGRAMO,
      esAnomalia: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const { service } = buildService({ incrementarConteo });

    await service.deshacerUltimoConteo(
      'inv-1',
      'art-1',
      2000,
      UnidadMedida.GRAMO,
    );

    expect(incrementarConteo).toHaveBeenCalledWith(
      expect.objectContaining({ delta: -2 }),
      TX_MARCADOR,
    );
  });

  it('si la unidad no se puede convertir (era UNIDAD_AMBIGUA), no resta nada — no había nada que deshacer', async () => {
    const incrementarConteo = jest.fn().mockResolvedValue({
      id: 'item-1',
      inventarioId: 'inv-1',
      articuloId: 'art-1',
      teorico: 5,
      conteoFisico: 0,
      unidadUsada: UnidadMedida.KILOGRAMO,
      esAnomalia: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const { service } = buildService({
      incrementarConteo,
      articulo: buildArticulo({
        id: 'art-1',
        unidadEstd: UnidadMedida.KILOGRAMO,
      }),
    });

    await service.deshacerUltimoConteo('inv-1', 'art-1', 1, UnidadMedida.LITRO);

    expect(incrementarConteo).toHaveBeenCalledWith(
      expect.objectContaining({ delta: 0 }),
      TX_MARCADOR,
    );
  });

  it('lanza NotFoundException si el artículo nunca se contó en este inventario', async () => {
    const findItem = jest.fn().mockResolvedValue(null);
    const { service } = buildService({ findItem });

    await expect(
      service.deshacerUltimoConteo(
        'inv-1',
        'art-1',
        20,
        UnidadMedida.KILOGRAMO,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('corre dentro de una transacción, igual que el flujo normal de escritura', async () => {
    const { service, ejecutarEnTransaccion } = buildService({});

    await service.deshacerUltimoConteo(
      'inv-1',
      'art-1',
      20,
      UnidadMedida.KILOGRAMO,
    );

    expect(ejecutarEnTransaccion).toHaveBeenCalledTimes(1);
  });
});
