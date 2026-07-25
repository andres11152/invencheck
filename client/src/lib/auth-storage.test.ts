import { describe, it, expect, beforeEach } from "vitest";
import { getToken, getUsuario, setSession, clearSession } from "./auth-storage";
import type { AuthenticatedUsuario } from "./types";

const usuario: AuthenticatedUsuario = {
  id: "u1",
  email: "operario@invencheck.demo",
  nombre: "Ana Operaria",
  rol: "OPERARIO",
};

describe("auth-storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("getToken/getUsuario devuelven null cuando no hay nada guardado", () => {
    expect(getToken()).toBeNull();
    expect(getUsuario()).toBeNull();
  });

  it("setSession escribe token y usuario en localStorage", () => {
    setSession("un-jwt", usuario);

    expect(getToken()).toBe("un-jwt");
    expect(getUsuario()).toEqual(usuario);
  });

  it("getUsuario no explota con JSON corrupto en localStorage", () => {
    window.localStorage.setItem("invencheck.usuario", "{esto no es json");

    expect(getUsuario()).toBeNull();
  });

  it("clearSession limpia token y usuario", () => {
    setSession("un-jwt", usuario);

    clearSession();

    expect(getToken()).toBeNull();
    expect(getUsuario()).toBeNull();
  });
});
