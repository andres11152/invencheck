import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TipoAlerta, UnidadMedida } from "@invencheck/shared";
import type {
  AlertaInventario,
  InventarioDetalle,
  ItemInventario,
  ProcesarTomaPorVozResult,
} from "@/lib/types";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getInventario: vi.fn(),
      procesarVoz: vi.fn(),
      procesarArticulo: vi.fn(),
      deshacerConteo: vi.fn(),
    },
  };
});

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    usuario: { id: "u1", email: "operario@invencheck.demo", nombre: "Operario", rol: "OPERARIO" },
    cargando: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-offline-sync", () => ({
  useOfflineSync: () => ({
    isOnline: true,
    pendientes: [],
    sincronizando: false,
    encolar: vi.fn(),
    sincronizar: vi.fn(),
    descartar: vi.fn(),
  }),
}));

// PrintActa is a print-only component; mocking it avoids duplicate text
// matches (e.g. "PAPA CRIOLLA") that break `findByText` assertions.
vi.mock("@/components/print-acta", () => ({
  PrintActa: () => null,
}));

import { api } from "@/lib/api";
import { InventarioPageContent } from "./inventario-page-content";

function inventarioBase(): InventarioDetalle {
  return {
    id: "inv-1",
    almacenId: "alm-1",
    usuarioId: "u1",
    auditorId: null,
    auditaAId: null,
    estado: "BORRADOR" as InventarioDetalle["estado"],
    fechaCorte: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    almacen: { id: "alm-1", codigo: "BOD-1", nombre: "Bodega Principal", unidad: "Piscilago", createdAt: "", updatedAt: "" },
    items: [],
    alertas: [],
    auditaA: null,
    auditoriaCiega: null,
  };
}

/**
 * Regresión de una condición de carrera real (auditoría de arquitectura,
 * hallazgo #4): `handleElegirCandidato` (selección manual de un candidato
 * ambiguo, ver items-no-matcheados-card.tsx) hacía su escritura al servidor
 * sin marcar `procesandoVoz`, a diferencia de `handleProcesar`/
 * `handleProcesarSku`. Mientras esa escritura estaba en vuelo, el input de
 * voz/texto de VoiceCapture seguía habilitado — el operario podía disparar
 * OTRO dictado concurrente, y como `aplicarResultado` hace
 * `setInventario(resultado.inventario)` con el snapshot completo devuelto
 * por cada request (no un merge), la respuesta que llegara última pisaba a
 * la otra sin importar cuál petición arrancó primero, perdiendo en pantalla
 * el ítem de la que "ganó" primero pero respondió después.
 */
describe("InventarioPageContent — hallazgo #4: procesandoVoz durante selección manual de candidato", () => {
  afterEach(() => cleanup());

  it("deshabilita el dictado por voz/texto mientras handleElegirCandidato está en vuelo, y lo reactiva al terminar", async () => {
    const user = userEvent.setup();
    const inventario = inventarioBase();

    vi.mocked(api.getInventario).mockResolvedValue(inventario);
    vi.mocked(api.procesarVoz).mockResolvedValue({
      inventario,
      fuenteIA: "REGLAS_LOCALES",
      itemsMatcheados: [],
      itemsNoMatcheados: [
        {
          articuloBusqueda: "papa criolla",
          cantidadDictada: 3,
          unidadDictada: UnidadMedida.KILOGRAMO,
          motivo:
            'Podría ser "PAPA CRIOLLA" o "PAPA CRIOLLA PRECOCIDA" — dilo tal cual, sin agregar nada, si es "PAPA CRIOLLA", o agrega "precocida" si es "PAPA CRIOLLA PRECOCIDA"',
          candidatos: [
            { id: "art-1", nombre: "PAPA CRIOLLA" },
            { id: "art-2", nombre: "PAPA CRIOLLA PRECOCIDA" },
          ],
        },
      ],
    } satisfies ProcesarTomaPorVozResult);

    let resolverProcesarArticulo!: (value: ProcesarTomaPorVozResult) => void;
    vi.mocked(api.procesarArticulo).mockReturnValue(
      new Promise((resolve) => {
        resolverProcesarArticulo = resolve;
      }),
    );

    render(<InventarioPageContent params={{ id: "inv-1" }} />);

    await waitFor(() => expect(api.getInventario).toHaveBeenCalled());

    // Dicta por texto (evita depender del navegador soportar Web Speech API).
    await user.type(screen.getByLabelText(/texto \(dictado o manual/i), "tres kilos de papa criolla");
    await user.click(screen.getByRole("button", { name: /procesar dictado/i }));

    // La ambigüedad real cae en la cola de "sin registrar" con las dos
    // opciones — hay que distinguir el botón de "PAPA CRIOLLA" del de
    // "PAPA CRIOLLA PRECOCIDA" (que también contiene "papa criolla").
    const botonPapaCriolla = await screen.findByRole("button", {
      name: (accessibleName) =>
        /papa criolla/i.test(accessibleName) && !/precocida/i.test(accessibleName),
    });

    // handleProcesar limpia el textarea al enviar — se vuelve a escribir algo
    // para que el estado `disabled` del botón de abajo solo pueda deberse a
    // `procesandoVoz`, no a que el texto esté vacío.
    await user.type(screen.getByLabelText(/texto \(dictado o manual/i), "otro dictado pendiente");

    await user.click(botonPapaCriolla);

    // Mientras procesarArticulo sigue sin resolver, el input de voz/texto
    // debe quedar deshabilitado — antes del fix, seguía activo, permitiendo
    // un dictado concurrente que podía pisar esta escritura en curso.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /procesar dictado/i })).toBeDisabled();
    });
    expect(screen.getByText(/procesando ia/i)).toBeInTheDocument();

    resolverProcesarArticulo({
      inventario,
      fuenteIA: "SELECCION_MANUAL",
      itemsMatcheados: [],
      itemsNoMatcheados: [],
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /procesar dictado/i })).not.toBeDisabled();
    });
    expect(screen.getByText(/listo para dictar/i)).toBeInTheDocument();
  });
});

/**
 * Regresión de un bug real reportado: "cuando se intenta varias veces el
 * mismo producto con anomalía se va sumando muchas veces la misma anomalía
 * en la misma card, en un momento rompe el diseño". Causa raíz: la card por
 * ítem recibía `inventario.alertas.filter((a) => a.itemInventarioId ===
 * item.id)` — filtrado SOLO por ítem, sin excluir las ya resueltas. Cada
 * ciclo dictar → anomalía → confirmar → auditor revisa → se cierra → volver
 * a dictar generaba una alerta NUEVA (correcto, la anterior ya está cerrada
 * a nivel de BD), pero el badge de la anterior, ya resuelta, se quedaba
 * pegado en la card para siempre — crecimiento sin límite con
 * `flex-wrap`. El header también contaba `inventario.alertas.length` sin
 * filtrar, mostrando un total histórico bajo la etiqueta "Alertas activas".
 */
describe("InventarioPageContent — alertas resueltas no se acumulan en la card del ítem", () => {
  afterEach(() => cleanup());

  function articulo() {
    return {
      id: "art-1",
      sku: "5120",
      nombre: "PAPA CRIOLLA",
      aliases: [],
      categoria: "AYB",
      unidadEstd: UnidadMedida.KILOGRAMO,
      esProcesado: false,
      stockHistoricoAvg: 50,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function item(): ItemInventario {
    return {
      id: "item-1",
      inventarioId: "inv-1",
      articuloId: "art-1",
      teorico: 50,
      conteoFisico: 900,
      unidadUsada: UnidadMedida.KILOGRAMO,
      esAnomalia: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      articulo: articulo(),
    };
  }

  function alerta(overrides: Partial<AlertaInventario>): AlertaInventario {
    return {
      id: "alerta-base",
      inventarioId: "inv-1",
      itemInventarioId: "item-1",
      tipo: TipoAlerta.ANOMALIA_CANTIDAD,
      mensaje: "Conteo se desvía del histórico",
      resuelto: false,
      revisadoPorAuditor: false,
      revisadoPor: null,
      revisadoEn: null,
      createdAt: new Date().toISOString(),
      ...overrides,
    };
  }

  it("una alerta ya resuelta+revisada de un ciclo anterior no se sigue mostrando como badge activo", async () => {
    const inventario = inventarioBase();
    inventario.items = [item()];
    inventario.alertas = [
      alerta({
        id: "alerta-vieja-cerrada",
        resuelto: true,
        revisadoPorAuditor: true,
        revisadoPor: "auditor@invencheck.demo",
        revisadoEn: new Date().toISOString(),
      }),
    ];

    vi.mocked(api.getInventario).mockResolvedValue(inventario);
    render(<InventarioPageContent params={{ id: "inv-1" }} />);

    await screen.findByText("PAPA CRIOLLA");

    expect(screen.queryByText("Anomalía")).not.toBeInTheDocument();
    // El header tampoco debe contar la alerta cerrada como "activa".
    expect(screen.getByText("Alertas activas").nextSibling?.textContent).toContain("0");
  });

  it("con una alerta vieja cerrada y una nueva activa del mismo tipo, solo se muestra un badge (no dos)", async () => {
    const inventario = inventarioBase();
    inventario.items = [item()];
    inventario.alertas = [
      alerta({
        id: "alerta-vieja-cerrada",
        resuelto: true,
        revisadoPorAuditor: true,
        revisadoPor: "auditor@invencheck.demo",
        revisadoEn: new Date().toISOString(),
      }),
      alerta({ id: "alerta-nueva-activa", resuelto: false, revisadoPorAuditor: false }),
    ];

    vi.mocked(api.getInventario).mockResolvedValue(inventario);
    render(<InventarioPageContent params={{ id: "inv-1" }} />);

    await screen.findByText("PAPA CRIOLLA");

    expect(screen.getAllByText("Anomalía")).toHaveLength(1);
  });
});

/**
 * Regresión de un bug real reportado (con capturas de producción):
 * "Re-dictar / Corregir" en el modal de anomalía dejaba el conteo
 * ACUMULADO en vez de reemplazado — el operario dictaba mal una cantidad,
 * usaba "Re-dictar/Corregir" para arreglarlo, y el número corregido se
 * sumaba sobre el erróneo en vez de reemplazarlo (el modal seguía
 * mostrando un total cada vez más alto en cada intento). El fix: antes de
 * dejar redication, se llama `api.deshacerConteo` para restar exactamente
 * la cantidad que causó la anomalía pendiente.
 */
describe("InventarioPageContent — Re-dictar/Corregir deshace el conteo anterior en vez de acumularlo", () => {
  afterEach(() => cleanup());

  function articuloArroz() {
    return {
      id: "art-arroz",
      sku: "6008",
      nombre: "ARROZ DOÑA PEPA",
      aliases: ["arroz dona pepa"],
      categoria: "AYB",
      unidadEstd: UnidadMedida.KILOGRAMO,
      esProcesado: false,
      stockHistoricoAvg: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function itemArroz(overrides: Partial<ItemInventario> = {}): ItemInventario {
    return {
      id: "item-arroz",
      inventarioId: "inv-1",
      articuloId: "art-arroz",
      teorico: 5,
      conteoFisico: 20,
      unidadUsada: UnidadMedida.KILOGRAMO,
      esAnomalia: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      articulo: articuloArroz(),
      ...overrides,
    };
  }

  function alertaAnomalia(overrides: Partial<AlertaInventario> = {}): AlertaInventario {
    return {
      id: "alerta-arroz",
      inventarioId: "inv-1",
      itemInventarioId: "item-arroz",
      tipo: TipoAlerta.ANOMALIA_CANTIDAD,
      mensaje: 'Conteo de 20 KILOGRAMO se desvía 300% del histórico general del catálogo (5.00) para "ARROZ DOÑA PEPA".',
      resuelto: false,
      revisadoPorAuditor: false,
      revisadoPor: null,
      revisadoEn: null,
      createdAt: new Date().toISOString(),
      ...overrides,
    };
  }

  it('al hacer click en "Re-dictar / Corregir", deshace la cantidad exacta que se acaba de dictar antes de dejar re-dictar', async () => {
    const user = userEvent.setup();
    const inventarioConAnomalia: InventarioDetalle = {
      ...inventarioBase(),
      items: [itemArroz()],
      alertas: [alertaAnomalia()],
    };

    vi.mocked(api.getInventario).mockResolvedValue(inventarioBase());
    vi.mocked(api.procesarVoz).mockResolvedValue({
      inventario: inventarioConAnomalia,
      fuenteIA: "REGLAS_LOCALES",
      itemsMatcheados: [
        {
          articuloBusqueda: "arroz dona pepa",
          articulo: articuloArroz(),
          cantidadDictada: 20,
          unidadDictada: UnidadMedida.KILOGRAMO,
          teorico: 5,
          conteoFisico: 20,
          unidadUsada: UnidadMedida.KILOGRAMO,
          esAnomalia: true,
          alertas: [alertaAnomalia().mensaje],
          scoreMatch: 1,
        },
      ],
      itemsNoMatcheados: [],
    } satisfies ProcesarTomaPorVozResult);

    const inventarioTrasDeshacer: InventarioDetalle = {
      ...inventarioBase(),
      items: [itemArroz({ conteoFisico: 0, esAnomalia: false })],
      alertas: [],
    };
    vi.mocked(api.deshacerConteo).mockResolvedValue({
      inventario: inventarioTrasDeshacer,
      fuenteIA: "SELECCION_MANUAL",
      itemsMatcheados: [],
      itemsNoMatcheados: [],
    } satisfies ProcesarTomaPorVozResult);

    render(<InventarioPageContent params={{ id: "inv-1" }} />);
    await waitFor(() => expect(api.getInventario).toHaveBeenCalled());

    await user.type(
      screen.getByLabelText(/texto \(dictado o manual/i),
      "20 kilos de arroz dona pepa",
    );
    await user.click(screen.getByRole("button", { name: /procesar dictado/i }));

    await screen.findByText(/¿confirmas 20 kg de arroz doña pepa\?/i);

    await user.click(screen.getByRole("button", { name: /re-dictar \/ corregir/i }));

    await waitFor(() => {
      expect(api.deshacerConteo).toHaveBeenCalledWith("inv-1", "art-arroz", {
        cantidadDictada: 20,
        unidadDictada: UnidadMedida.KILOGRAMO,
      });
    });

    // El modal ya no debe mostrar la anomalía deshecha (conteo reemplazado
    // por el estado que devuelve deshacerConteo, sin alertas activas) —
    // antes del fix, ni siquiera se llamaba a este endpoint.
    await waitFor(() => {
      expect(
        screen.queryByText(/¿confirmas 20 kg de arroz doña pepa\?/i),
      ).not.toBeInTheDocument();
    });
  });

  it('si "Re-dictar/Corregir" se usa para reabrir una card vieja (sin dictado en esta sesión), NO llama a deshacerConteo', async () => {
    vi.mocked(api.deshacerConteo).mockClear();
    const user = userEvent.setup();
    const inventarioConAnomalia: InventarioDetalle = {
      ...inventarioBase(),
      items: [itemArroz()],
      alertas: [alertaAnomalia()],
    };
    vi.mocked(api.getInventario).mockResolvedValue(inventarioConAnomalia);

    render(<InventarioPageContent params={{ id: "inv-1" }} />);
    await screen.findByText("ARROZ DOÑA PEPA");

    // Reabre la anomalía haciendo click directo en la card (no acaba de
    // dictar nada en esta sesión — ej. recargó la página).
    await user.click(screen.getByText("ARROZ DOÑA PEPA"));
    await screen.findByText(/¿confirmas 20 kg de arroz doña pepa\?/i);

    await user.click(screen.getByRole("button", { name: /re-dictar \/ corregir/i }));

    expect(api.deshacerConteo).not.toHaveBeenCalled();
  });
});
