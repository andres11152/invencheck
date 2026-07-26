import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnidadMedida, TipoAlerta } from "@invencheck/shared";
import { ItemInventarioCard } from "./item-inventario-card";
import type { AlertaInventario, ItemInventario } from "@/lib/types";

function item(overrides: Partial<ItemInventario> = {}): ItemInventario {
  return {
    id: "item-1",
    inventarioId: "inv-1",
    articuloId: "art-1",
    teorico: 319.91,
    conteoFisico: 220,
    unidadUsada: UnidadMedida.KILOGRAMO,
    esAnomalia: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    articulo: {
      id: "art-1",
      sku: "5134",
      nombre: "PLATANO ARTON",
      aliases: [],
      categoria: "AYB",
      unidadEstd: UnidadMedida.KILOGRAMO,
      esProcesado: false,
      stockHistoricoAvg: 319.91,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    ...overrides,
  };
}

function alerta(overrides: Partial<AlertaInventario> = {}): AlertaInventario {
  return {
    id: "alerta-1",
    inventarioId: "inv-1",
    itemInventarioId: "item-1",
    tipo: TipoAlerta.ANOMALIA_CANTIDAD,
    mensaje: "Conteo de 20 KILOGRAMO se desvía -94% del histórico general del catálogo (319.91).",
    resuelto: true,
    revisadoPorAuditor: false,
    revisadoPor: null,
    revisadoEn: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Regresión de un bug real: `esAnomalia` en el ítem solo refleja la última
 * evaluación, no si sigue habiendo una alerta activa sin resolver. Una
 * alerta vieja (creada cuando el conteo era mucho menor) puede seguir
 * activa mientras `esAnomalia` ya se corrigió a `false` en una
 * re-evaluación posterior — el click para abrir el modal no debe depender
 * de ese booleano, sino de si hay alertas activas de verdad.
 */
describe("ItemInventarioCard", () => {
  afterEach(() => cleanup());

  it("con esAnomalia=false pero una alerta activa igual permite hacer click para revisarla", async () => {
    const user = userEvent.setup();
    const onRevisarAnomalia = vi.fn();
    render(
      <ItemInventarioCard
        item={item({ esAnomalia: false })}
        alertas={[alerta()]}
        onRevisarAnomalia={onRevisarAnomalia}
      />,
    );

    expect(screen.getByText(/Anomalía/i)).toBeInTheDocument();
    // La Card entera es el área clickeable — se hace click sobre el nombre del artículo.
    await user.click(screen.getByText("PLATANO ARTON"));
    expect(onRevisarAnomalia).toHaveBeenCalledTimes(1);
  });

  it("sin ninguna alerta activa, el click no hace nada", async () => {
    const user = userEvent.setup();
    const onRevisarAnomalia = vi.fn();
    render(
      <ItemInventarioCard
        item={item({ esAnomalia: false })}
        alertas={[]}
        onRevisarAnomalia={onRevisarAnomalia}
      />,
    );

    await user.click(screen.getByText("PLATANO ARTON"));
    expect(onRevisarAnomalia).not.toHaveBeenCalled();
  });
});
