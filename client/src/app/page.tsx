"use client";

// Ruta dinámica en cuanto a datos (fetch client-side de bodegas): sin esto,
// el paso de "Collect page data" de `next build` falla con
// `TypeError: n.createContext is not a function` al analizar esta página
// para optimización estática. Confirmado con el build, no es un parche
// especulativo — ver también inventario/[id]/page.tsx.
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BarChart3, ClipboardList, Loader2, SearchX } from "lucide-react";
import { InvenCheckLogo } from "@/components/invencheck-logo";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Almacen } from "@/lib/types";
import { AccountMenu } from "@/components/account-menu";
import { AlmacenCard } from "@/components/almacen-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClientProviders } from "@/components/client-providers";
import { useAuth } from "@/components/auth-provider";

const UNIDADES = ["Todas", "Piscilago", "Hoteles"] as const;

function AlmacenesPageContent() {
  const { usuario } = useAuth();
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
      const inventario = await api.crearInventario({ almacenId: seleccionado.id });
      router.push(`/inventario/${inventario.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo crear la toma física");
      setIniciando(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-4 pb-28 sm:p-8">
      {/* ── Header de marca InvenCheck — barra glass ── */}
      <header className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/55 px-4 py-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_10px_30px_-14px_rgba(0,0,0,0.55)] backdrop-blur-xl backdrop-saturate-150">
        <div className="flex items-center gap-4">
          {/* Logo InvenCheck oficial */}
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary p-1.5 shadow-lg">
            <InvenCheckLogo variant="color" size="sm" priority />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              Inven<span className="text-secondary">Check</span>
            </h1>
            <p className="text-xs font-medium text-muted-foreground">
              Gestión de Inventario
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/reportes"
            aria-label="Ver Reportes"
            className="inline-flex items-center gap-1.5 rounded-full p-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-secondary"
          >
            <BarChart3 className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Reportes</span>
          </Link>
          <div className="border-l border-border pl-3">
            <AccountMenu />
          </div>
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
            /* Skeleton con la misma silueta que AlmacenCard (ícono + 2 líneas +
             * pill), no una barra genérica — se lee como un placeholder real. */
            <div
              key={i}
              className="rounded-2xl border border-border/70 bg-card/65 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_10px_30px_-14px_rgba(0,0,0,0.55)]"
            >
              <div className="flex items-start gap-3">
                <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              </div>
            </div>
          ))}

        {!cargando &&
          almacenesFiltrados.map((almacen, i) => (
            <div
              key={almacen.id}
              className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-300"
              style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
            >
              <AlmacenCard
                almacen={almacen}
                seleccionado={almacen.id === seleccionadoId}
                onSelect={() => setSeleccionadoId(almacen.id)}
              />
            </div>
          ))}

        {!cargando && almacenesFiltrados.length === 0 && !error && (
          <EmptyState
            className="col-span-full"
            icon={SearchX}
            title="No hay bodegas para este filtro"
            description="Prueba con otra unidad de negocio en las pestañas de arriba."
          />
        )}
      </div>

      {/* 
        Espacio de compensación inferior para evitar que las tarjetas del fondo 
        queden tapadas por la barra flotante al hacer scroll.
      */}
      <div className="h-28 sm:h-24" />

      {/* Barra de acción flotante — glass con blur real, superficie única en pantalla */}
      <div className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] -translate-x-1/2 max-w-5xl rounded-2xl border border-border/60 bg-card/80 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_20px_50px_-10px_rgba(0,0,0,0.7)] backdrop-blur-xl backdrop-saturate-150 transition-all duration-300">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex items-center gap-3">
            {seleccionado ? (
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75"></span>
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success"></span>
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Bodega: <span className="font-semibold text-secondary">{seleccionado.nombre}</span>
                  </p>
                  {usuario?.rol !== "OPERARIO" && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-secondary uppercase tracking-wider bg-white/10 px-2 py-0.5 rounded-md mt-0.5 animate-pulse">
                      ⚡ Modo Contingencia (Superusuario)
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Selecciona una bodega de la lista para comenzar
              </p>
            )}
          </div>
          <Button
            size="lg"
            disabled={!seleccionado || iniciando}
            onClick={iniciarTomaFisica}
            className={cn(
              "w-full shrink-0 font-semibold sm:w-auto transition-all duration-300",
              seleccionado && (
                usuario?.rol === "OPERARIO" 
                  ? "animate-pulse-ring bg-primary hover:bg-primary/90 text-white" 
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/90 shadow-lg shadow-secondary/20"
              )
            )}
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

export default function AlmacenesPage() {
  return (
    <ClientProviders>
      <AlmacenesPageContent />
    </ClientProviders>
  );
}
