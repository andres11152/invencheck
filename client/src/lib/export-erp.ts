import type { InventarioDetalle, VariacionArticulo } from "./types";
import { calcularMerma } from "./format";

const CSV_HEADERS = [
  "sku",
  "articulo",
  "categoria",
  "unidad",
  "teorico",
  "conteoFisico",
  "merma",
  "esAnomalia",
];

function csvEscape(value: string | number | boolean): string {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function rowsToCsv(headers: string[], rows: (string | number | boolean)[][]): string {
  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

export function inventarioToCsv(inventario: InventarioDetalle): string {
  const rows = inventario.items.map((item) => [
    item.articulo.sku ?? "",
    item.articulo.nombre,
    item.articulo.categoria,
    item.unidadUsada,
    item.teorico,
    item.conteoFisico,
    calcularMerma(item.conteoFisico, item.teorico),
    item.esAnomalia ? "SI" : "NO",
  ]);

  return rowsToCsv(CSV_HEADERS, rows);
}

const VARIACION_CSV_HEADERS = [
  "sku",
  "articulo",
  "categoria",
  "unidad",
  "tomas",
  "anomalias",
  "promedioTeorico",
  "promedioContado",
  "mermaTotal",
  "mermaPromedio",
  "ultimaFecha",
];

export function reporteVariacionToCsv(filas: VariacionArticulo[]): string {
  const rows = filas.map((f) => [
    f.sku ?? "",
    f.nombre,
    f.categoria,
    f.unidadEstd,
    f.tomas,
    f.anomalias,
    f.promedioTeorico,
    f.promedioContado,
    f.mermaTotal,
    f.mermaPromedio,
    f.ultimaFecha,
  ]);
  return rowsToCsv(VARIACION_CSV_HEADERS, rows);
}

export function inventarioToErpJson(inventario: InventarioDetalle) {
  return {
    inventarioId: inventario.id,
    almacen: { codigo: inventario.almacen.codigo, nombre: inventario.almacen.nombre },
    fechaCorte: inventario.fechaCorte,
    estado: inventario.estado,
    items: inventario.items.map((item) => ({
      sku: item.articulo.sku,
      nombre: item.articulo.nombre,
      unidad: item.unidadUsada,
      teorico: item.teorico,
      conteoFisico: item.conteoFisico,
      merma: calcularMerma(item.conteoFisico, item.teorico),
      esAnomalia: item.esAnomalia,
    })),
  };
}

export function descargarArchivo(contenido: string, nombre: string, mime: string) {
  const blob = new Blob([contenido], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
