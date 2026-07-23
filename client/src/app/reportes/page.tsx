"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, BarChart3, Download, Loader2 } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { Almacen, VariacionArticulo } from "@/lib/types";
import { descargarArchivo, reporteVariacionToCsv } from "@/lib/export-erp";
import { formatCantidad, formatFecha, formatNumero } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function ReportesPage() {
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [almacenId, setAlmacenId] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const [filas, setFilas] = useState<VariacionArticulo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getAlmacenes().then(setAlmacenes).catch(() => {});
  }, []);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const data = await api.getReporteVariacion({
        almacenId: almacenId || undefined,
        desde: desde || undefined,
        hasta: hasta || undefined,
      });
      setFilas(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar el reporte");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function exportar() {
    if (filas.length === 0) return;
    descargarArchivo(
      reporteVariacionToCsv(filas),
      `reporte-variacion-${new Date().toISOString().slice(0, 10)}.csv`,
      "text/csv;charset=utf-8",
    );
    toast.success("CSV exportado");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-4 sm:p-8">
      <header className="space-y-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Bodegas
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold sm:text-2xl">Variación por artículo</h1>
            <p className="text-sm text-muted-foreground">
              Teórico vs. contado acumulado en todas las tomas físicas — qué artículos dan
              problemas con más frecuencia
            </p>
          </div>
        </div>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="almacen">Bodega</Label>
            <select
              id="almacen"
              value={almacenId}
              onChange={(e) => setAlmacenId(e.target.value)}
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
            >
              <option value="">Todas las bodegas</option>
              {almacenes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="desde">Desde</Label>
            <Input id="desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="hasta">Hasta</Label>
            <Input id="hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <Button onClick={() => void cargar()} disabled={cargando}>
            {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aplicar filtros"}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {cargando && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {!cargando && !error && filas.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            No hay tomas físicas registradas para este filtro todavía.
          </CardContent>
        </Card>
      )}

      {!cargando && filas.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{filas.length} artículo(s)</CardTitle>
            <Button size="sm" variant="outline" onClick={exportar}>
              <Download className="h-4 w-4" />
              Exportar CSV
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-2">Artículo</th>
                    <th className="py-2 pr-2">Tomas</th>
                    <th className="py-2 pr-2">Anomalías</th>
                    <th className="py-2 pr-2">Teórico</th>
                    <th className="py-2 pr-2">Contado</th>
                    <th className="py-2 pr-2">Merma</th>
                    <th className="py-2 pr-2">Última toma</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((fila) => (
                    <tr key={fila.articuloId} className="border-b border-border/50">
                      <td className="py-2 pr-2">
                        <p className="font-medium">{fila.nombre}</p>
                        <p className="text-xs text-muted-foreground">{fila.categoria}</p>
                      </td>
                      <td className="py-2 pr-2">{fila.tomas}</td>
                      <td className="py-2 pr-2">
                        {fila.anomalias > 0 ? (
                          <Badge variant="destructive">{fila.anomalias}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="py-2 pr-2 whitespace-nowrap">
                        {formatCantidad(fila.promedioTeorico, fila.unidadEstd)}
                      </td>
                      <td className="py-2 pr-2 whitespace-nowrap">
                        {formatCantidad(fila.promedioContado, fila.unidadEstd)}
                      </td>
                      <td
                        className={cn(
                          "py-2 pr-2 whitespace-nowrap font-medium",
                          fila.mermaTotal < 0
                            ? "text-destructive"
                            : fila.mermaTotal > 0
                              ? "text-success"
                              : "text-muted-foreground",
                        )}
                      >
                        {fila.mermaTotal > 0 ? "+" : ""}
                        {formatNumero(fila.mermaTotal)}
                      </td>
                      <td className="py-2 pr-2 whitespace-nowrap text-muted-foreground">
                        {formatFecha(fila.ultimaFecha)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
