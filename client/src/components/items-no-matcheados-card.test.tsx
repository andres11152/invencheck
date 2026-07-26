import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnidadMedida } from "@invencheck/shared";
import { ItemsNoMatcheadosCard, type NoMatcheadoPendiente } from "./items-no-matcheados-card";

function pendiente(overrides: Partial<NoMatcheadoPendiente> = {}): NoMatcheadoPendiente {
  return {
    id: "pend-1",
    articuloBusqueda: "papa criolla",
    cantidadDictada: 20,
    unidadDictada: UnidadMedida.KILOGRAMO,
    motivo: 'Podría ser "PAPA CRIOLLA" o "PAPA CRIOLLA PRECOCIDA" — sé más específico',
    ...overrides,
  };
}

describe("ItemsNoMatcheadosCard", () => {
  afterEach(() => cleanup());

  it("no renderiza nada si no hay ítems pendientes", () => {
    const { container } = render(
      <ItemsNoMatcheadosCard items={[]} onReintentar={vi.fn()} onDescartar={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("muestra cada ítem pendiente con su cantidad y motivo", () => {
    render(
      <ItemsNoMatcheadosCard
        items={[pendiente()]}
        onReintentar={vi.fn()}
        onDescartar={vi.fn()}
      />,
    );
    expect(screen.getByText(/papa criolla/)).toBeInTheDocument();
    expect(screen.getByText(/PAPA CRIOLLA PRECOCIDA/)).toBeInTheDocument();
  });

  it("Re-dictar llama a onReintentar con el id del ítem", async () => {
    const user = userEvent.setup();
    const onReintentar = vi.fn();
    render(
      <ItemsNoMatcheadosCard
        items={[pendiente({ id: "pend-9" })]}
        onReintentar={onReintentar}
        onDescartar={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /re-dictar/i }));
    expect(onReintentar).toHaveBeenCalledWith("pend-9");
  });

  it("descartar (botón X) llama a onDescartar con el id del ítem", async () => {
    const user = userEvent.setup();
    const onDescartar = vi.fn();
    render(
      <ItemsNoMatcheadosCard
        items={[pendiente({ id: "pend-7" })]}
        onReintentar={vi.fn()}
        onDescartar={onDescartar}
      />,
    );
    // El botón de descartar es el segundo botón (solo tiene ícono, sin texto accesible propio).
    const botones = screen.getAllByRole("button");
    await user.click(botones[botones.length - 1]);
    expect(onDescartar).toHaveBeenCalledWith("pend-7");
  });

  it("lista varios ítems pendientes a la vez", () => {
    render(
      <ItemsNoMatcheadosCard
        items={[
          pendiente({ id: "a", articuloBusqueda: "papa criolla" }),
          pendiente({ id: "b", articuloBusqueda: "aceite", motivo: "Sin coincidencia en el catálogo" }),
        ]}
        onReintentar={vi.fn()}
        onDescartar={vi.fn()}
      />,
    );
    expect(screen.getByText(/Sin registrar todavía \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/papa criolla/)).toBeInTheDocument();
    expect(screen.getByText(/aceite/)).toBeInTheDocument();
  });
});
