import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnidadMedida } from "@invencheck/shared";
import { ItemsNoMatcheadosCard, type NoMatcheadoPendiente } from "./items-no-matcheados-card";

function pendiente(overrides: Partial<NoMatcheadoPendiente> = {}): NoMatcheadoPendiente {
  return {
    id: "pend-1",
    articuloBusqueda: "papa criolla",
    cantidadDictada: 20,
    unidadDictada: UnidadMedida.KILOGRAMO,
    motivo: 'Podría ser "PAPA CRIOLLA" o "PAPA CRIOLLA PRECOCIDA" — dilo tal cual, sin agregar nada, si es "PAPA CRIOLLA", o agrega "precocida" si es "PAPA CRIOLLA PRECOCIDA"',
    ...overrides,
  };
}

describe("ItemsNoMatcheadosCard", () => {
  afterEach(() => cleanup());

  it("no renderiza nada si no hay ítems pendientes", () => {
    const { container } = render(
      <ItemsNoMatcheadosCard
        items={[]}
        onReintentar={vi.fn()}
        onDescartar={vi.fn()}
        onElegirCandidato={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("muestra cada ítem pendiente con su cantidad y motivo", () => {
    render(
      <ItemsNoMatcheadosCard
        items={[pendiente()]}
        onReintentar={vi.fn()}
        onDescartar={vi.fn()}
        onElegirCandidato={vi.fn()}
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
        onElegirCandidato={vi.fn()}
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
        onElegirCandidato={vi.fn()}
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
        onElegirCandidato={vi.fn()}
      />,
    );
    expect(screen.getByText(/Sin registrar todavía \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/papa criolla/)).toBeInTheDocument();
    expect(screen.getByText(/aceite/)).toBeInTheDocument();
  });

  // Regresión de un bug real: cuando un candidato es prefijo exacto de otro
  // ("PAPA CRIOLLA" / "PAPA CRIOLLA PRECOCIDA"), no hay ninguna frase que se
  // pueda decir por voz para elegir el corto sin reproducir la MISMA
  // ambigüedad — re-dictar entraba en loop infinito. La salida real es
  // elegir directamente en pantalla.
  describe("selección directa de candidatos", () => {
    function pendienteAmbigua(): NoMatcheadoPendiente {
      return pendiente({
        candidatos: [
          { id: "art-cruda", nombre: "PAPA CRIOLLA" },
          { id: "art-precocida", nombre: "PAPA CRIOLLA PRECOCIDA" },
        ],
      });
    }

    it("muestra un botón por cada candidato cuando hay ambigüedad real", () => {
      render(
        <ItemsNoMatcheadosCard
          items={[pendienteAmbigua()]}
          onReintentar={vi.fn()}
          onDescartar={vi.fn()}
          onElegirCandidato={vi.fn()}
        />,
      );
      // El componente usa comillas tipográficas (&ldquo;/&rdquo;), no comillas rectas.
      expect(
        screen.getByRole("button", { name: /es\s*“papa criolla”$/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /es\s*“papa criolla precocida”$/i }),
      ).toBeInTheDocument();
    });

    it("no muestra botones de candidato cuando no hay ambigüedad (sin coincidencia genérica)", () => {
      render(
        <ItemsNoMatcheadosCard
          items={[pendiente({ candidatos: undefined, motivo: "Sin coincidencia en el catálogo" })]}
          onReintentar={vi.fn()}
          onDescartar={vi.fn()}
          onElegirCandidato={vi.fn()}
        />,
      );
      expect(screen.queryByText(/^Es\s*“/)).not.toBeInTheDocument();
    });

    it("clickear un candidato llama a onElegirCandidato con el ítem y el id elegido", async () => {
      const user = userEvent.setup();
      const onElegirCandidato = vi.fn().mockResolvedValue(undefined);
      const item = pendienteAmbigua();
      render(
        <ItemsNoMatcheadosCard
          items={[item]}
          onReintentar={vi.fn()}
          onDescartar={vi.fn()}
          onElegirCandidato={onElegirCandidato}
        />,
      );

      await user.click(screen.getByRole("button", { name: /es\s*“papa criolla”$/i }));

      await waitFor(() => {
        expect(onElegirCandidato).toHaveBeenCalledWith(item, "art-cruda");
      });
    });
  });
});
