"use client";

// Ver nota en app/page.tsx: necesario para que "Collect page data" de
// `next build` no falle con `TypeError: n.createContext is not a function`.
export const dynamic = "force-dynamic";

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ClientProviders } from "@/components/client-providers";

const TODAS_LAS_BODEGAS = "__todas__";

function ReportesPageContent() {
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [almacenId, setAlmacenId] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const [filasVariacion, setFilasVariacion] = useState<VariacionArticulo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getAlmacenes().then(setAlmacenes).catch(() => {});
  }, []);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const params = {
        almacenId: almacenId || undefined,
        desde: desde || undefined,
        hasta: hasta || undefined,
      };
      setFilasVariacion(await api.getReporteVariacion(params));
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

  function exportarVariacion() {
    if (filasVariacion.length === 0) return;
    descargarArchivo(
      reporteVariacionToCsv(filasVariacion),
      `reporte-variacion-${new Date().toISOString().slice(0, 10)}.csv`,
      "text/csv;charset=utf-8",
    );
    toast.success("CSV exportado");
  }

  async function exportarOracleMyInventory() {
    try {
      const blob = await api.exportOracleMyInventoryCsv({
        almacenId: almacenId && almacenId !== TODAS_LAS_BODEGAS ? almacenId : undefined,
        desde: desde || undefined,
        hasta: hasta || undefined,
      });
      descargarArchivo(blob, `oracle-myinventory-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success("CSV Oracle MyInventory exportado");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo exportar el CSV");
    }
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
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md transition-transform duration-300 hover:scale-105">
            <BarChart3 className="h-5.5 w-5.5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold sm:text-2xl">Reportes</h1>
            <p className="text-sm text-muted-foreground">
              Teórico vs. contado acumulado en todas las tomas físicas — qué artículos dan problemas con más frecuencia
            </p>
          </div>
        </div>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="almacen">Bodega</Label>
            {/* Radix Select no permite value="" en un Item (lo reserva para "sin selección"),
                así que "todas las bodegas" usa un sentinel y se traduce de vuelta a "" acá. */}
            <Select
              value={almacenId || TODAS_LAS_BODEGAS}
              onValueChange={(v) => setAlmacenId(v === TODAS_LAS_BODEGAS ? "" : v)}
            >
              <SelectTrigger id="almacen">
                <SelectValue placeholder="Todas las bodegas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS_LAS_BODEGAS}>Todas las bodegas</SelectItem>
                {almacenes.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

      {!cargando && !error && filasVariacion.length === 0 && (
        <EmptyState
          icon={BarChart3}
          title="Sin datos registrados"
          description="Todavía no hay tomas físicas para este filtro."
        />
      )}

      {!cargando && filasVariacion.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{filasVariacion.length} artículo(s)</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={exportarOracleMyInventory} className="border-primary/40 text-primary hover:bg-primary/10">
                <Download className="h-4 w-4" />
                Oracle MyInventory (CSV)
              </Button>
              <Button size="sm" variant="outline" onClick={exportarVariacion}>
                <Download className="h-4 w-4" />
                Exportar CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Artículo</TableHead>
                  <TableHead>Tomas</TableHead>
                  <TableHead>Anomalías</TableHead>
                  <TableHead>Teórico</TableHead>
                  <TableHead>Contado</TableHead>
                  <TableHead>Merma</TableHead>
                  <TableHead>Última toma</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filasVariacion.map((fila) => (
                  <TableRow key={fila.articuloId}>
                    <TableCell>
                      <p className="font-medium">{fila.nombre}</p>
                      <p className="text-xs text-muted-foreground">{fila.categoria}</p>
                    </TableCell>
                    <TableCell>{fila.tomas}</TableCell>
                    <TableCell>
                      {fila.anomalias > 0 ? (
                        <Badge variant="destructive">{fila.anomalias}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatCantidad(fila.promedioTeorico, fila.unidadEstd)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatCantidad(fila.promedioContado, fila.unidadEstd)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "whitespace-nowrap font-medium",
                        fila.mermaTotal < 0
                          ? "text-destructive"
                          : fila.mermaTotal > 0
                            ? "text-success"
                            : "text-muted-foreground",
                      )}
                    >
                      {fila.mermaTotal > 0 ? "+" : ""}
                      {formatNumero(fila.mermaTotal)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatFecha(fila.ultimaFecha)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </main>
  );
}

export default function ReportesPage() {
  return (
    <ClientProviders>
      <ReportesPageContent />
    </ClientProviders>
  );
}
