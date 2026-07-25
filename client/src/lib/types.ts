import type { EstadoInventario, TipoAlerta, UnidadMedida } from "@invencheck/shared";

export type RolUsuario = "OPERARIO" | "AUDITOR" | "ADMIN";

export interface AuthenticatedUsuario {
  id: string;
  email: string;
  nombre: string;
  rol: RolUsuario;
}

export interface LoginResult {
  accessToken: string;
  usuario: AuthenticatedUsuario;
}

export interface Almacen {
  id: string;
  codigo: string;
  nombre: string;
  unidad: string;
  createdAt: string;
  updatedAt: string;
}

export interface Articulo {
  id: string;
  sku: string | null;
  nombre: string;
  aliases: string[];
  categoria: string;
  unidadEstd: UnidadMedida;
  esProcesado: boolean;
  stockHistoricoAvg: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ItemInventario {
  id: string;
  inventarioId: string;
  articuloId: string;
  teorico: number;
  conteoFisico: number;
  unidadUsada: UnidadMedida;
  esAnomalia: boolean;
  createdAt: string;
  updatedAt: string;
  articulo: Articulo;
}

export interface AlertaInventario {
  id: string;
  inventarioId: string;
  itemInventarioId: string | null;
  tipo: TipoAlerta;
  mensaje: string;
  resuelto: boolean;
  createdAt: string;
}

export interface Inventario {
  id: string;
  almacenId: string;
  usuarioId: string;
  auditorId: string | null;
  auditaAId: string | null;
  estado: EstadoInventario;
  fechaCorte: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditaAInfo {
  id: string;
  usuarioId: string;
  almacen: { nombre: string };
}

export interface AuditoriaCiegaInfo {
  id: string;
  usuarioId: string;
  estado: EstadoInventario;
}

export interface InventarioDetalle extends Inventario {
  almacen: Almacen;
  items: ItemInventario[];
  alertas: AlertaInventario[];
  /** Si ESTE inventario ES la auditoría ciega de otro. */
  auditaA: AuditaAInfo | null;
  /** Si ESTE inventario TIENE una auditoría ciega en curso. */
  auditoriaCiega: AuditoriaCiegaInfo | null;
}

export interface ComparacionAuditoriaItem {
  articulo: Articulo;
  unidad: UnidadMedida;
  conteoOriginal: number | null;
  conteoAuditoria: number | null;
  diferencia: number | null;
  coincide: boolean;
}

export interface ComparacionAuditoriaResult {
  original: InventarioDetalle;
  auditoria: InventarioDetalle | null;
  items: ComparacionAuditoriaItem[];
}

export interface ItemProcesadoResumen {
  articuloBusqueda: string;
  articulo: Articulo;
  cantidadDictada: number;
  unidadDictada: UnidadMedida;
  teorico: number;
  conteoFisico: number;
  unidadUsada: UnidadMedida;
  esAnomalia: boolean;
  alertas: string[];
  scoreMatch: number;
}

export interface ItemNoMatcheado {
  articuloBusqueda: string;
  cantidadDictada: number;
  unidadDictada: UnidadMedida;
  motivo: string;
}

export interface ProcesarTomaPorVozResult {
  inventario: InventarioDetalle;
  fuenteIA: "GEMINI" | "REGLAS_LOCALES" | "ESCANER_SKU";
  itemsMatcheados: ItemProcesadoResumen[];
  itemsNoMatcheados: ItemNoMatcheado[];
}

export interface VariacionArticulo {
  articuloId: string;
  sku: string | null;
  nombre: string;
  categoria: string;
  unidadEstd: UnidadMedida;
  tomas: number;
  anomalias: number;
  promedioTeorico: number;
  promedioContado: number;
  mermaTotal: number;
  mermaPromedio: number;
  ultimaFecha: string;
}
