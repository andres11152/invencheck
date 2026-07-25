import type { EstadoInventario } from "@invencheck/shared";
import type {
  Almacen,
  AlertaInventario,
  ComparacionAuditoriaResult,
  Inventario,
  InventarioDetalle,
  LoginResult,
  ProcesarTomaPorVozResult,
  VariacionArticulo,
} from "./types";
import { clearSession, getToken } from "./auth-storage";

const rawApiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";
const API_URL = rawApiUrl.endsWith("/api") ? rawApiUrl : `${rawApiUrl.replace(/\/$/, "")}/api`;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(
      `No se pudo contactar la API en ${API_URL}. ¿Está corriendo el backend?`,
      0,
    );
  }

  if (!response.ok) {
    // Sesión inválida/expirada en una ruta protegida (no el intento de login
    // en sí, que también responde 401 con credenciales incorrectas y debe
    // manejarlo el propio formulario, no una redirección global).
    if (response.status === 401 && token && path !== "/auth/login") {
      clearSession();
      if (typeof window !== "undefined") window.location.href = "/login";
    }

    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : (body?.message ?? `Error ${response.status}`);
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<LoginResult>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  getAlmacenes: (unidad?: string) =>
    request<Almacen[]>(`/almacenes${unidad ? `?unidad=${encodeURIComponent(unidad)}` : ""}`),

  crearInventario: (data: { almacenId: string }) =>
    request<Inventario>("/inventarios", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getInventario: (id: string) => request<InventarioDetalle>(`/inventarios/${id}`),

  procesarVoz: (id: string, texto: string) =>
    request<ProcesarTomaPorVozResult>(`/inventarios/${id}/procesar-voz`, {
      method: "POST",
      body: JSON.stringify({ texto }),
    }),

  cambiarEstado: (id: string, estado: EstadoInventario) =>
    request<Inventario>(`/inventarios/${id}/estado`, {
      method: "PATCH",
      body: JSON.stringify({ estado }),
    }),

  resolverAlerta: (inventarioId: string, alertaId: string) =>
    request<AlertaInventario>(`/inventarios/${inventarioId}/alertas/${alertaId}/resolver`, {
      method: "PATCH",
    }),

  crearAuditoriaCiega: (id: string) =>
    request<Inventario>(`/inventarios/${id}/auditoria-ciega`, {
      method: "POST",
    }),

  getComparacionAuditoria: (id: string) =>
    request<ComparacionAuditoriaResult>(`/inventarios/${id}/comparacion-auditoria`),

  getReporteVariacion: (params: { almacenId?: string; desde?: string; hasta?: string }) => {
    const query = new URLSearchParams();
    if (params.almacenId) query.set("almacenId", params.almacenId);
    if (params.desde) query.set("desde", params.desde);
    if (params.hasta) query.set("hasta", params.hasta);
    const qs = query.toString();
    return request<VariacionArticulo[]>(`/reportes/variacion${qs ? `?${qs}` : ""}`);
  },
};
