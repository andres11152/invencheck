import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnidadMedida, TipoAlerta } from "@invencheck/shared";
import { AnomaliaModal, type AnomaliaModalEntrada } from "./anomalia-modal";
import type { Articulo, ItemInventario, AlertaInventario } from "@/lib/types";

function articulo(overrides: Partial<Articulo> = {}): Articulo {
  return {
    id: "art-1",
    sku: null,
    nombre: "PAPA CRIOLLA",
    aliases: [],
    categoria: "Verduras",
    unidadEstd: UnidadMedida.KILOGRAMO,
    esProcesado: false,
    stockHistoricoAvg: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function item(overrides: Partial<ItemInventario> = {}): ItemInventario {
  return {
    id: "item-1",
    inventarioId: "inv-1",
    articuloId: "art-1",
    teorico: 10,
    conteoFisico: 100,
    unidadUsada: UnidadMedida.KILOGRAMO,
    esAnomalia: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    articulo: articulo(),
    ...overrides,
  };
}

function alerta(overrides: Partial<AlertaInventario> = {}): AlertaInventario {
  return {
    id: "alerta-1",
    inventarioId: "inv-1",
    itemInventarioId: "item-1",
    tipo: TipoAlerta.ANOMALIA_CANTIDAD,
    mensaje: "Conteo se desvía 900% del histórico",
    resuelto: false,
    revisadoPorAuditor: false,
    revisadoPor: null,
    revisadoEn: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function entrada(overrides: Partial<AnomaliaModalEntrada> = {}): AnomaliaModalEntrada {
  return {
    item: item(),
    alertas: [alerta()],
    ...overrides,
  };
}

describe("AnomaliaModal", () => {
  beforeEach(() => {
    // jsdom no implementa navigator.vibrate.
    Object.defineProperty(navigator, "vibrate", {
      value: vi.fn(),
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("con entrada null no renderiza contenido de alerta", () => {
    render(
      <AnomaliaModal entrada={null} total={0} onConfirmar={vi.fn()} onRedictar={vi.fn()} />,
    );

    expect(screen.queryByText(/Confirmas/)).not.toBeInTheDocument();
  });

  it("con una nueva entrada dispara navigator.vibrate exactamente una vez", () => {
    render(
      <AnomaliaModal entrada={entrada()} total={1} onConfirmar={vi.fn()} onRedictar={vi.fn()} />,
    );

    expect(navigator.vibrate).toHaveBeenCalledTimes(1);
    expect(navigator.vibrate).toHaveBeenCalledWith(200);
  });

  // Regresión de un bug de precisión real: el modal mostraba una línea fija
  // "Promedio habitual: X" usando SIEMPRE `articulo.stockHistoricoAvg` (el
  // promedio GLOBAL del catálogo, mezclando las 48 bodegas) — sin importar
  // si la alerta de abajo en realidad se calculó contra el histórico de
  // ESA bodega específica (un número distinto). El operario podía ver dos
  // cifras diferentes en el mismo modal sin ninguna aclaración de cuál era
  // cuál. Ahora el único número mostrado es el del mensaje de la alerta,
  // que ya trae su fuente identificada.
  it("no duplica un promedio genérico del catálogo — solo muestra el mensaje de la alerta, ya con su fuente identificada", () => {
    render(
      <AnomaliaModal
        entrada={entrada({
          item: item({ articulo: articulo({ stockHistoricoAvg: 999999 }) }),
          alertas: [
            alerta({
              mensaje:
                'Conteo de 20 KILOGRAMO se desvía -84% del histórico de esta bodega (126.99) para "PAPA CRIOLLA".',
            }),
          ],
        })}
        total={1}
        onConfirmar={vi.fn()}
        onRedictar={vi.fn()}
      />,
    );

    // El número real usado para evaluar la anomalía (126.99, de ESTA
    // bodega) sí debe verse — con su fuente aclarada en el propio texto.
    expect(screen.getByText(/histórico de esta bodega \(126.99\)/)).toBeInTheDocument();
    // El promedio GLOBAL del catálogo (999999, un valor totalmente distinto
    // y potencialmente engañoso si no coincide con el usado) NO debe
    // aparecer sin más como si fuera "el" promedio habitual.
    expect(screen.queryByText(/999999/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Promedio habitual/)).not.toBeInTheDocument();
  });

  it('llama a onRedictar al hacer clic en "Re-dictar / Corregir"', async () => {
    const onRedictar = vi.fn();
    const user = userEvent.setup();
    render(
      <AnomaliaModal entrada={entrada()} total={1} onConfirmar={vi.fn()} onRedictar={onRedictar} />,
    );

    await user.click(screen.getByRole("button", { name: /Re-dictar/ }));

    expect(onRedictar).toHaveBeenCalledTimes(1);
  });

  it('llama a onConfirmar al hacer clic en "Confirmar Cantidad"', async () => {
    const onConfirmar = vi.fn();
    const user = userEvent.setup();
    render(
      <AnomaliaModal entrada={entrada()} total={1} onConfirmar={onConfirmar} onRedictar={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: /Confirmar Cantidad/ }));

    expect(onConfirmar).toHaveBeenCalledTimes(1);
  });
});
