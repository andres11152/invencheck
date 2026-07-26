import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EstadoInventario, UnidadMedida, TipoAlerta } from "@invencheck/shared";
import type { InventarioDetalle, ItemInventario, AlertaInventario } from "@/lib/types";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, cambiarEstado: vi.fn() } };
});

const mockUseAuth = vi.fn();
vi.mock("@/components/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

import { AccionesCierre } from "./acciones-cierre";

function item(overrides: Partial<ItemInventario> = {}): ItemInventario {
  return {
    id: "item-1",
    inventarioId: "inv-1",
    articuloId: "art-1",
    teorico: 100,
    conteoFisico: 100,
    unidadUsada: UnidadMedida.KILOGRAMO,
    esAnomalia: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    articulo: {
      id: "art-1",
      sku: null,
      nombre: "PAPA CRIOLLA",
      aliases: [],
      categoria: "Verduras",
      unidadEstd: UnidadMedida.KILOGRAMO,
      esProcesado: false,
      stockHistoricoAvg: 100,
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
    mensaje: "Conteo se desvía del histórico",
    resuelto: false,
    revisadoPorAuditor: false,
    revisadoPor: null,
    revisadoEn: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function inventario(overrides: Partial<InventarioDetalle> = {}): InventarioDetalle {
  return {
    id: "inv-1",
    almacenId: "alm-1",
    usuarioId: "user-1",
    auditorId: null,
    auditaAId: null,
    estado: EstadoInventario.BORRADOR,
    fechaCorte: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    almacen: { id: "alm-1", codigo: "BOD-01", nombre: "Bodega Principal", unidad: "Piscilago", createdAt: "", updatedAt: "" },
    items: [item()],
    alertas: [],
    auditaA: null,
    auditoriaCiega: null,
    ...overrides,
  };
}

describe("AccionesCierre", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("como AUDITOR sin alertas activas, el botón de consolidar está habilitado y separado de los exports", () => {
    mockUseAuth.mockReturnValue({ usuario: { rol: "AUDITOR" } });
    render(<AccionesCierre inventario={inventario()} onEstadoActualizado={vi.fn()} />);

    const boton = screen.getByRole("button", { name: /consolidar y finalizar/i });
    expect(boton).not.toBeDisabled();
    expect(screen.getByText("Exportar")).toBeInTheDocument();
  });

  it("como AUDITOR con alertas activas, el botón de consolidar queda deshabilitado y se explica por qué", () => {
    mockUseAuth.mockReturnValue({ usuario: { rol: "AUDITOR" } });
    render(
      <AccionesCierre
        inventario={inventario({ alertas: [alerta()] })}
        onEstadoActualizado={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /consolidar y finalizar/i })).toBeDisabled();
    expect(screen.getByText(/hay 1 alerta\(s\) sin confirmar/i)).toBeInTheDocument();
  });

  it("como OPERARIO, no se muestra el botón de consolidar — solo el aviso de que se necesita un auditor", () => {
    mockUseAuth.mockReturnValue({ usuario: { rol: "OPERARIO" } });
    render(<AccionesCierre inventario={inventario()} onEstadoActualizado={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /consolidar y finalizar/i })).not.toBeInTheDocument();
    expect(
      screen.getByText(/solo un auditor o administrador puede consolidar/i),
    ).toBeInTheDocument();
    // Las exportaciones siguen disponibles para cualquier rol.
    expect(screen.getByText("Exportar")).toBeInTheDocument();
  });

  it("con el inventario ya CONCILIADO, se ofrece 'Enviar a ERP' en vez de 'Consolidar'", () => {
    mockUseAuth.mockReturnValue({ usuario: { rol: "AUDITOR" } });
    render(
      <AccionesCierre
        inventario={inventario({ estado: EstadoInventario.CONCILIADO })}
        onEstadoActualizado={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /enviar a erp/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /consolidado/i })).toBeDisabled();
  });
});
