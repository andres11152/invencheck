"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Calculator, Loader2 } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { Almacen, ExplosionInsumosResult, RecetaDetalle } from "@/lib/types";
import { formatCantidad, formatNumero } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const FUENTE_LABEL: Record<ExplosionInsumosResult["insumos"][number]["fuenteDisponible"], string> = {
  TOMA_FISICA: "última toma física",
  PROMEDIO_HISTORICO: "promedio histórico",
  SIN_DATO: "sin dato de stock",
};

export default function RecetaDetallePage({ params }: { params: { id: string } }) {
  const recetaId = params.id;

  const [receta, setReceta] = useState<RecetaDetalle | null>(null);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [porciones, setPorciones] = useState<number>(1);
  const [almacenId, setAlmacenId] = useState<string>("");
  const [calculando, setCalculando] = useState(false);
  const [resultado, setResultado] = useState<ExplosionInsumosResult | null>(null);

  useEffect(() => {
    Promise.all([api.getReceta(recetaId), api.getAlmacenes()])
      .then(([recetaData, almacenesData]) => {
        setReceta(recetaData);
        setPorciones(recetaData.porciones);
        setAlmacenes(almacenesData);
      })
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : "No se pudo cargar la receta"),
      )
      .finally(() => setCargando(false));
  }, [recetaId]);

  async function calcular() {
    if (porciones <= 0) {
      toast.error("Las porciones deben ser mayores a 0");
      return;
    }
    setCalculando(true);
    try {
      const data = await api.explosionInsumos(recetaId, porciones, almacenId || undefined);
      setResultado(data);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo calcular la explosión");
    } finally {
      setCalculando(false);
    }
  }

  if (cargando) {
    return (
      <main className="mx-auto max-w-5xl space-y-4 p-4 sm:p-8">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-48 w-full" />
      </main>
    );
  }

  if (error || !receta) {
    return (
      <main className="mx-auto max-w-3xl p-4 sm:p-8">
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error ?? "Receta no encontrada"}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 pb-10 sm:p-8">
      <header className="space-y-2">
        <Link
          href="/recetas"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Recetas
        </Link>
        <h1 className="text-xl font-semibold sm:text-2xl">{receta.nombre}</h1>
        <p className="text-sm text-muted-foreground">
          Receta base para {receta.porciones} porciones · {receta.items.length} insumo(s)
        </p>
      </header>

      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 space-y-6 lg:space-y-0">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Insumos base (por porción)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {receta.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm">
                <span>{item.articulo.nombre}</span>
                <span className="text-muted-foreground">
                  {formatCantidad(item.cantidadPorPorcion, item.unidad)} / porción
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>¿Cuántas porciones prepara hoy el chef?</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="porciones">Porciones a preparar</Label>
                <Input
                  id="porciones"
                  type="number"
                  min={0.1}
                  step="1"
                  value={porciones}
                  onChange={(e) => setPorciones(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="almacen">Comparar contra bodega (opcional)</Label>
                <select
                  id="almacen"
                  value={almacenId}
                  onChange={(e) => setAlmacenId(e.target.value)}
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
                >
                  <option value="">Cualquier bodega (más reciente)</option>
                  {almacenes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Button onClick={calcular} disabled={calculando}>
              {calculando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Calculator className="h-4 w-4" />
              )}
              Calcular insumos
            </Button>
          </CardContent>
        </Card>
      </div>

      {resultado && (
        <Card>
          <CardHeader>
            <CardTitle>
              Insumos para {formatNumero(resultado.porcionesSolicitadas)} porciones
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {resultado.insumos.map((insumo, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-lg border border-border p-3",
                  insumo.faltante > 0 && "border-warning/50 bg-warning/[0.06]",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{insumo.articulo.nombre}</p>
                  <Badge variant={insumo.fuenteDisponible === "SIN_DATO" ? "outline" : "secondary"}>
                    {FUENTE_LABEL[insumo.fuenteDisponible]}
                  </Badge>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Necesario</p>
                    <p className="font-semibold">{formatCantidad(insumo.necesario, insumo.unidad)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Disponible</p>
                    <p className="font-semibold">{formatCantidad(insumo.disponible, insumo.unidad)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Hace falta pedir</p>
                    <p
                      className={cn(
                        "font-semibold",
                        insumo.faltante > 0 ? "text-warning" : "text-success",
                      )}
                    >
                      {insumo.faltante > 0
                        ? formatCantidad(insumo.faltante, insumo.unidad)
                        : "Cubierto"}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
