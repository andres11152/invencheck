"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BarChart3, ChefHat, ClipboardList, Loader2, Warehouse } from "lucide-react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { getUsuarioIdLocal } from "@/lib/usuario-local";
import type { Almacen } from "@/lib/types";
import { AlmacenCard } from "@/components/almacen-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const UNIDADES = ["Todas", "Piscilago", "Hoteles"] as const;

export default function AlmacenesPage() {
  const router = useRouter();
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroUnidad, setFiltroUnidad] = useState<(typeof UNIDADES)[number]>("Todas");
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [iniciando, setIniciando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    api
      .getAlmacenes()
      .then((data) => {
        if (!cancelado) setAlmacenes(data);
      })
      .catch((err: unknown) => {
        if (!cancelado) setError(err instanceof ApiError ? err.message : "Error al cargar bodegas");
      })
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, []);

  const almacenesFiltrados = useMemo(() => {
    if (filtroUnidad === "Todas") return almacenes;
    return almacenes.filter((a) => a.unidad === filtroUnidad);
  }, [almacenes, filtroUnidad]);

  const seleccionado = almacenes.find((a) => a.id === seleccionadoId) ?? null;

  async function iniciarTomaFisica() {
    if (!seleccionado) return;
    setIniciando(true);
    try {
      const inventario = await api.crearInventario({
        almacenId: seleccionado.id,
        usuarioId: getUsuarioIdLocal(),
      });
      router.push(`/inventario/${inventario.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo crear la toma física");
      setIniciando(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-4 pb-28 sm:p-8">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Warehouse className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold sm:text-2xl">InvenCheck</h1>
            <p className="text-sm text-muted-foreground">
              Selecciona una bodega para iniciar la toma física
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/recetas"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChefHat className="h-4 w-4" />
            Recetas
          </Link>
          <Link
            href="/reportes"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <BarChart3 className="h-4 w-4" />
            Reportes
          </Link>
        </div>
      </header>

      <Tabs value={filtroUnidad} onValueChange={(v) => setFiltroUnidad(v as typeof filtroUnidad)}>
        <TabsList>
          {UNIDADES.map((u) => (
            <TabsTrigger key={u} value={u}>
              {u}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cargando &&
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}

        {!cargando &&
          almacenesFiltrados.map((almacen) => (
            <AlmacenCard
              key={almacen.id}
              almacen={almacen}
              seleccionado={almacen.id === seleccionadoId}
              onSelect={() => setSeleccionadoId(almacen.id)}
            />
          ))}

        {!cargando && almacenesFiltrados.length === 0 && !error && (
          <p className="col-span-full py-12 text-center text-sm text-muted-foreground">
            No hay bodegas para el filtro seleccionado.
          </p>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 p-4 backdrop-blur safe-bottom">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <p className="truncate text-sm text-muted-foreground">
            {seleccionado ? (
              <>
                Bodega: <span className="font-medium text-foreground">{seleccionado.nombre}</span>
              </>
            ) : (
              "Elige una bodega para continuar"
            )}
          </p>
          <Button
            size="lg"
            disabled={!seleccionado || iniciando}
            onClick={iniciarTomaFisica}
            className="shrink-0"
          >
            {iniciando ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <ClipboardList className="h-5 w-5" />
            )}
            Iniciar Toma Física
          </Button>
        </div>
      </div>
    </main>
  );
}
