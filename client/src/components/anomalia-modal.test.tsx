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

  it("muestra el promedio histórico cuando el artículo lo tiene", () => {
    render(
      <AnomaliaModal
        entrada={entrada({ item: item({ articulo: articulo({ stockHistoricoAvg: 10 }) }) })}
        total={1}
        onConfirmar={vi.fn()}
        onRedictar={vi.fn()}
      />,
    );

    expect(screen.getByText(/Promedio habitual/)).toBeInTheDocument();
  });

  it("sin promedio histórico muestra el mensaje de 'sin promedio registrado'", () => {
    render(
      <AnomaliaModal
        entrada={entrada({ item: item({ articulo: articulo({ stockHistoricoAvg: null }) }) })}
        total={1}
        onConfirmar={vi.fn()}
        onRedictar={vi.fn()}
      />,
    );

    expect(screen.getByText(/no tiene promedio histórico registrado/)).toBeInTheDocument();
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
