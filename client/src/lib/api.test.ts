import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, ApiError } from "./api";
import * as authStorage from "./auth-storage";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("api.request (vía api.getAlmacenes)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("adjunta el header Authorization cuando hay token guardado", async () => {
    authStorage.setSession("un-jwt", {
      id: "u1",
      email: "a@b.com",
      nombre: "A",
      rol: "OPERARIO",
    });
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([]));

    await api.getAlmacenes();

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer un-jwt",
    );
  });

  it("no adjunta Authorization cuando no hay token", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([]));

    await api.getAlmacenes();

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("una falla de red lanza ApiError con status 0", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("network error"));

    const error = await api.getAlmacenes().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0 });
  });

  it("una respuesta no-2xx lanza ApiError con el status real y el mensaje del body", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ message: "Almacén no encontrado" }, 404),
    );

    await expect(api.getAlmacenes()).rejects.toMatchObject({
      status: 404,
      message: "Almacén no encontrado",
    });
  });

  it("un 401 fuera de /auth/login limpia la sesión y redirige a /login", async () => {
    authStorage.setSession("un-jwt", {
      id: "u1",
      email: "a@b.com",
      nombre: "A",
      rol: "OPERARIO",
    });
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ message: "Expirado" }, 401));

    await expect(api.getAlmacenes()).rejects.toMatchObject({ status: 401 });

    expect(authStorage.getToken()).toBeNull();
  });

  it("un 401 en /auth/login NO limpia la sesión (lo maneja el propio formulario)", async () => {
    authStorage.setSession("un-jwt", {
      id: "u1",
      email: "a@b.com",
      nombre: "A",
      rol: "OPERARIO",
    });
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ message: "Credenciales inválidas" }, 401),
    );

    await expect(api.login("a@b.com", "mala-clave")).rejects.toMatchObject({
      status: 401,
    });

    expect(authStorage.getToken()).toBe("un-jwt");
  });
});

describe("api.getReporteVariacion", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("no agrega query string si no se pasa ningún filtro", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([]));

    await api.getReporteVariacion({});

    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toMatch(/\/reportes\/variacion$/);
  });

  it("arma la query string solo con los filtros presentes", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([]));

    await api.getReporteVariacion({ almacenId: "alm-1", desde: "2026-01-01" });

    const [url] = vi.mocked(fetch).mock.calls[0];
    const query = new URL(url as string).searchParams;
    expect(query.get("almacenId")).toBe("alm-1");
    expect(query.get("desde")).toBe("2026-01-01");
    expect(query.has("hasta")).toBe(false);
  });
});
