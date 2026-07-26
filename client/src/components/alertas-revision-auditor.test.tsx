import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TipoAlerta } from "@invencheck/shared";
import type { AlertaInventario } from "@/lib/types";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, revisarAlerta: vi.fn() } };
});

import { api } from "@/lib/api";
import { AlertasRevisionAuditor } from "./alertas-revision-auditor";

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

describe("AlertasRevisionAuditor", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("no renderiza nada si no hay alertas confirmadas-por-operario pendientes de revisión", () => {
    const { container } = render(
      <AlertasRevisionAuditor
        inventarioId="inv-1"
        alertas={[alerta({ resuelto: false, revisadoPorAuditor: false })]}
        onRevisada={vi.fn()}
      />,
    );
    // Sin confirmar por el operario todavía: no es "pendiente de auditor", es
    // el auto-chequeo (lo maneja AnomaliaModal), no debe aparecer acá.
    expect(container).toBeEmptyDOMElement();
  });

  it("no renderiza nada si la alerta ya fue revisada por un auditor", () => {
    const { container } = render(
      <AlertasRevisionAuditor
        inventarioId="inv-1"
        alertas={[alerta({ resuelto: true, revisadoPorAuditor: true })]}
        onRevisada={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("lista las alertas confirmadas por el operario pero sin revisión de auditor", () => {
    render(
      <AlertasRevisionAuditor
        inventarioId="inv-1"
        alertas={[alerta({ resuelto: true, revisadoPorAuditor: false })]}
        onRevisada={vi.fn()}
      />,
    );
    expect(screen.getByText(/Conteo se desvía 900%/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /marcar revisada/i })).toBeInTheDocument();
  });

  it("al hacer clic en Marcar revisada llama a api.revisarAlerta y luego onRevisada", async () => {
    const user = userEvent.setup();
    const onRevisada = vi.fn();
    vi.mocked(api.revisarAlerta).mockResolvedValue(
      alerta({ resuelto: true, revisadoPorAuditor: true }),
    );

    render(
      <AlertasRevisionAuditor
        inventarioId="inv-1"
        alertas={[alerta({ id: "alerta-9", resuelto: true, revisadoPorAuditor: false })]}
        onRevisada={onRevisada}
      />,
    );

    await user.click(screen.getByRole("button", { name: /marcar revisada/i }));

    await waitFor(() => {
      expect(api.revisarAlerta).toHaveBeenCalledWith("inv-1", "alerta-9");
      expect(onRevisada).toHaveBeenCalled();
    });
  });
});
