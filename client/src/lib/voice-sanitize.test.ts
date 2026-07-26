import { describe, it, expect } from "vitest";
import { limpiarRepeticiones } from "./voice-sanitize";

describe("limpiarRepeticiones", () => {
  it("colapsa el caso real reportado en Android", () => {
    expect(limpiarRepeticiones("80 80 80 kg 80 kg 80 kg de maíz")).toBe("80 kg de maíz");
  });

  it("colapsa repeticiones de una sola palabra", () => {
    expect(limpiarRepeticiones("cinco cinco cinco kilos de papa")).toBe("cinco kilos de papa");
  });

  it("colapsa repeticiones de frases de varias palabras", () => {
    expect(limpiarRepeticiones("quince kilos quince kilos de arroz")).toBe("quince kilos de arroz");
  });

  it("no toca texto sin repeticiones", () => {
    expect(limpiarRepeticiones("veinte kilos de papa criolla")).toBe("veinte kilos de papa criolla");
  });

  it("preserva tildes y ñ", () => {
    expect(limpiarRepeticiones("dos dos kilos de maíz y compañía")).toBe(
      "dos kilos de maíz y compañía",
    );
  });

  it("no colapsa palabras distintas que casualmente se repiten en el texto (no adyacentes)", () => {
    expect(limpiarRepeticiones("cinco kilos de papa y cinco kilos de cebolla")).toBe(
      "cinco kilos de papa y cinco kilos de cebolla",
    );
  });
});
