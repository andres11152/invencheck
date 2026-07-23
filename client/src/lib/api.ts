import type { EstadoInventario } from "@invencheck/shared";
import type {
  Almacen,
  AlertaInventario,
  ComparacionAuditoriaResult,
  ExplosionInsumosResult,
  Inventario,
  InventarioDetalle,
  ProcesarTomaPorVozResult,
  Receta,
  RecetaDetalle,
  VariacionArticulo,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

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
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(
      `No se pudo contactar la API en ${API_URL}. ¿Está corriendo el backend?`,
      0,
    );
  }

  if (!response.ok) {
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
  getAlmacenes: (unidad?: string) =>
    request<Almacen[]>(`/almacenes${unidad ? `?unidad=${encodeURIComponent(unidad)}` : ""}`),

  crearInventario: (data: { almacenId: string; usuarioId: string }) =>
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

  crearAuditoriaCiega: (id: string, auditorId: string) =>
    request<Inventario>(`/inventarios/${id}/auditoria-ciega`, {
      method: "POST",
      body: JSON.stringify({ auditorId }),
    }),

  getComparacionAuditoria: (id: string) =>
    request<ComparacionAuditoriaResult>(`/inventarios/${id}/comparacion-auditoria`),

  getRecetas: () => request<Receta[]>("/recetas"),

  getReceta: (id: string) => request<RecetaDetalle>(`/recetas/${id}`),

  explosionInsumos: (id: string, porciones: number, almacenId?: string) =>
    request<ExplosionInsumosResult>(`/recetas/${id}/explosion`, {
      method: "POST",
      body: JSON.stringify({ porciones, almacenId }),
    }),

  getReporteVariacion: (params: { almacenId?: string; desde?: string; hasta?: string }) => {
    const query = new URLSearchParams();
    if (params.almacenId) query.set("almacenId", params.almacenId);
    if (params.desde) query.set("desde", params.desde);
    if (params.hasta) query.set("hasta", params.hasta);
    const qs = query.toString();
    return request<VariacionArticulo[]>(`/reportes/variacion${qs ? `?${qs}` : ""}`);
  },
};
