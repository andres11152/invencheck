import type { EstadoInventario, UnidadMedida } from "@invencheck/shared";
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

async function fetchAutenticado(path: string, init?: RequestInit): Promise<Response> {
  const token = getToken();
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
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

    const rawBody = await response.text().catch(() => "");
    const parsed = (() => {
      try {
        return JSON.parse(rawBody) as { message?: string | string[] };
      } catch {
        return null;
      }
    })();
    const message = Array.isArray(parsed?.message)
      ? parsed.message.join(", ")
      : (parsed?.message ?? (rawBody || `Error ${response.status}`));
    throw new ApiError(message, response.status);
  }

  return response;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchAutenticado(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/**
 * Para endpoints que devuelven un archivo (CSV) en vez de JSON — no se puede
 * usar `request<T>` porque este hace `response.json()` incondicionalmente.
 * Sigue pasando por el mismo `fetchAutenticado` (adjunta el JWT, maneja
 * 401/red igual que el resto de la API) en vez de un `window.open()` directo,
 * que nunca lleva el header `Authorization` y por eso el endpoint responde
 * 401 en una pestaña en blanco.
 */
async function requestBlob(path: string): Promise<Blob> {
  const response = await fetchAutenticado(path);
  return response.blob();
}

type VariacionParams = { almacenId?: string; desde?: string; hasta?: string };

function buildVariacionQueryString(params: VariacionParams): string {
  const query = new URLSearchParams();
  if (params.almacenId) query.set("almacenId", params.almacenId);
  if (params.desde) query.set("desde", params.desde);
  if (params.hasta) query.set("hasta", params.hasta);
  const qs = query.toString();
  return qs ? `?${qs}` : "";
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

  // Entrada por SKU exacto (escáner de código de barras) — match sin
  // ambigüedad, a diferencia de procesarVoz con texto libre.
  procesarSku: (id: string, data: { sku: string; cantidad: number; unidadDictada?: UnidadMedida }) =>
    request<ProcesarTomaPorVozResult>(`/inventarios/${id}/procesar-sku`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Selección manual directa de un candidato ambiguo (por id) — rompe el
  // loop de re-dictar cuando un candidato es prefijo exacto de otro y por
  // voz es imposible distinguirlo del dictado ambiguo original.
  procesarArticulo: (
    id: string,
    data: { articuloId: string; cantidad: number; unidadDictada?: UnidadMedida },
  ) =>
    request<ProcesarTomaPorVozResult>(`/inventarios/${id}/procesar-articulo`, {
      method: "POST",
      body: JSON.stringify(data),
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

  // Solo AUDITOR/ADMIN (RolesGuard en el servidor); es el gate real que
  // desbloquea cambiarEstado, distinto del auto-chequeo de resolverAlerta.
  revisarAlerta: (inventarioId: string, alertaId: string) =>
    request<AlertaInventario>(`/inventarios/${inventarioId}/alertas/${alertaId}/revisar`, {
      method: "PATCH",
    }),

  crearAuditoriaCiega: (id: string) =>
    request<Inventario>(`/inventarios/${id}/auditoria-ciega`, {
      method: "POST",
    }),

  getComparacionAuditoria: (id: string) =>
    request<ComparacionAuditoriaResult>(`/inventarios/${id}/comparacion-auditoria`),

  getReporteVariacion: (params: VariacionParams) =>
    request<VariacionArticulo[]>(`/reportes/variacion${buildVariacionQueryString(params)}`),

  exportOracleMyInventoryCsv: (params: VariacionParams) =>
    requestBlob(`/reportes/export-oracle-myinventory${buildVariacionQueryString(params)}`),
};
