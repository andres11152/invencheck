import type { TipoAlerta, UnidadMedida } from "@invencheck/shared";

const UNIDAD_LABELS: Record<UnidadMedida, string> = {
  UNIDAD: "un",
  KILOGRAMO: "kg",
  GRAMO: "g",
  LITRO: "L",
  MILILITRO: "mL",
  PORCION: "porciones",
  CANASTILLA: "canastillas",
  CAJA: "cajas",
};

export function unidadLabel(unidad: UnidadMedida): string {
  return UNIDAD_LABELS[unidad] ?? unidad;
}

export function formatCantidad(valor: number, unidad: UnidadMedida): string {
  const formateado = Number.isInteger(valor)
    ? valor.toString()
    : valor.toLocaleString("es-CO", { maximumFractionDigits: 2 });
  return `${formateado} ${unidadLabel(unidad)}`;
}

export function formatNumero(valor: number): string {
  return valor.toLocaleString("es-CO", { maximumFractionDigits: 2 });
}

export function formatFecha(iso: string): string {
  return new Date(iso).toLocaleString("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export const TIPO_ALERTA_LABEL: Record<TipoAlerta, string> = {
  ANOMALIA_CANTIDAD: "Anomalía",
  STOCK_NEGATIVO: "Stock negativo ERP",
  SKU_FALTANTE: "SKU faltante",
  UNIDAD_AMBIGUA: "Unidad ambigua",
};

export const TIPO_ALERTA_ICON: Record<TipoAlerta, string> = {
  ANOMALIA_CANTIDAD: "🚨",
  STOCK_NEGATIVO: "🔴",
  SKU_FALTANTE: "🟡",
  UNIDAD_AMBIGUA: "⚠️",
};

export type BadgeTono = "destructive" | "warning" | "success" | "secondary";

export function tonoAlerta(tipo: TipoAlerta): BadgeTono {
  switch (tipo) {
    case "STOCK_NEGATIVO":
    case "ANOMALIA_CANTIDAD":
      return "destructive";
    case "UNIDAD_AMBIGUA":
    case "SKU_FALTANTE":
      return "warning";
    default:
      return "secondary";
  }
}

/** Diferencia conteo físico vs. teórico; positivo = sobrante, negativo = merma. */
export function calcularMerma(conteoFisico: number, teorico: number): number {
  return Math.round((conteoFisico - teorico) * 100) / 100;
}

export function calcularVariacionPct(conteoFisico: number, promedio: number | null): number | null {
  if (promedio === null || promedio <= 0) return null;
  return Math.round(((conteoFisico - promedio) / promedio) * 100);
}
