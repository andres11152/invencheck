import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TipoAlerta, UnidadMedida } from "@invencheck/shared";
import { InventarioHeader } from "./inventario-header";
import type { AlertaInventario, InventarioDetalle } from "@/lib/types";

function inventario(overrides: Partial<InventarioDetalle> = {}): InventarioDetalle {
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
    items: [
      {
        id: "item-1",
        inventarioId: "inv-1",
        articuloId: "art-1",
        teorico: 50,
        conteoFisico: 900,
        unidadUsada: UnidadMedida.KILOGRAMO,
        esAnomalia: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        articulo: {
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
        },
      },
    ],
    alertas: [],
    auditaA: null,
    auditoriaCiega: null,
    ...overrides,
  };
}

function alerta(overrides: Partial<AlertaInventario> = {}): AlertaInventario {
  return {
    id: "alerta-1",
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

/**
 * Regresión de un bug real: el tile "Alertas activas" mostraba
 * `inventario.alertas.length` sin filtrar por `resuelto` — un total
 * histórico de TODAS las alertas creadas alguna vez (incluidas las de
 * ciclos ya cerrados por un auditor), no las realmente activas.
 */
describe("InventarioHeader", () => {
  afterEach(() => cleanup());

  it("no cuenta alertas ya resueltas y revisadas como activas", () => {
    render(
      <InventarioHeader
        inventario={inventario({
          alertas: [
            alerta({ resuelto: true, revisadoPorAuditor: true }),
            alerta({ id: "alerta-2", resuelto: true, revisadoPorAuditor: true }),
          ],
        })}
      />,
    );

    expect(screen.getByText("Alertas activas").nextSibling?.textContent).toBe("0");
  });

  it("cuenta solo las alertas sin resolver, ignorando las ya cerradas de ciclos anteriores", () => {
    render(
      <InventarioHeader
        inventario={inventario({
          alertas: [
            alerta({ id: "alerta-vieja", resuelto: true, revisadoPorAuditor: true }),
            alerta({ id: "alerta-activa", resuelto: false }),
          ],
        })}
      />,
    );

    expect(screen.getByText("Alertas activas").nextSibling?.textContent).toContain("1");
  });
});
