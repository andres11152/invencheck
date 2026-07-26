import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnidadMedida } from "@invencheck/shared";
import type { InventarioDetalle, ProcesarTomaPorVozResult } from "@/lib/types";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getInventario: vi.fn(),
      procesarVoz: vi.fn(),
      procesarArticulo: vi.fn(),
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
