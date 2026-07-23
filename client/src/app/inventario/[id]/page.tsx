"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { EstadoInventario } from "@invencheck/shared";

import { api, ApiError } from "@/lib/api";
import type { InventarioDetalle, ProcesarTomaPorVozResult } from "@/lib/types";
import { useOfflineSync } from "@/hooks/use-offline-sync";
import { InventarioHeader } from "@/components/inventario-header";
import { VoiceCapture } from "@/components/voice-capture";
import { ItemInventarioCard } from "@/components/item-inventario-card";
import { AnomaliaModal } from "@/components/anomalia-modal";
import { AccionesCierre } from "@/components/acciones-cierre";
import { ColaOfflineIndicator } from "@/components/cola-offline-indicator";
import { AuditoriaCiegaCard } from "@/components/auditoria-ciega-card";
import { Skeleton } from "@/components/ui/skeleton";

export default function InventarioPage({ params }: { params: { id: string } }) {
  const inventarioId = params.id;

  const [inventario, setInventario] = useState<InventarioDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [procesandoVoz, setProcesandoVoz] = useState(false);
  const [voiceResetKey, setVoiceResetKey] = useState(0);
  const [ultimaFuenteIA, setUltimaFuenteIA] = useState<
    "OPENAI" | "GEMINI" | "REGLAS_LOCALES" | null
  >(null);

  // Anomalías "saltadas" en esta sesión (Re-dictar sin resolver todavía):
  // no vuelven a mostrarse EN ESTA VISITA, pero NO se resuelven — si el
  // operario recarga o cierra y vuelve, reaparecen. Así no se pueden
  // ignorar permanentemente cerrando la pestaña.
  const [saltados, setSaltados] = useState<Set<string>>(new Set());

  const cargar = useCallback(async () => {
    try {
      const data = await api.getInventario(inventarioId);
      setInventario(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar el inventario");
    } finally {
      setCargando(false);
    }
  }, [inventarioId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Se deriva directamente del inventario persistido (no de la respuesta de
  // un solo dictado): sobrevive a recargas de página y a sincronizaciones
  // offline, y es la fuente que realmente bloquea "Consolidar" en el backend.
  const anomaliasPendientes = useMemo(() => {
    if (!inventario) return [];
    return inventario.items
      .filter((item) => item.esAnomalia && !saltados.has(item.id))
      .map((item) => ({
        item,
        alertas: inventario.alertas.filter((a) => a.itemInventarioId === item.id),
      }))
      .filter((entrada) => entrada.alertas.length > 0);
  }, [inventario, saltados]);

  const anomaliaActual = anomaliasPendientes[0] ?? null;

  function aplicarResultado(resultado: ProcesarTomaPorVozResult, origenOffline: boolean) {
    setInventario(resultado.inventario);
    setUltimaFuenteIA(resultado.fuenteIA);
    setSaltados(new Set()); // dictado nuevo: vuelve a mostrar todo lo pendiente

    if (resultado.itemsNoMatcheados.length > 0) {
      toast.warning(
        `No se encontró coincidencia para: ${resultado.itemsNoMatcheados
          .map((i) => i.articuloBusqueda)
          .join(", ")}`,
      );
    }

    const anomalias = resultado.itemsMatcheados.filter((i) => i.esAnomalia);
    if (anomalias.length === 0 && resultado.itemsMatcheados.length > 0) {
      const engineName =
        resultado.fuenteIA === "GEMINI"
          ? "Gemini AI"
          : resultado.fuenteIA === "OPENAI"
            ? "OpenAI"
            : "reglas locales";
      toast.success(
        `${resultado.itemsMatcheados.length} ítem(s) ${origenOffline ? "sincronizados" : "registrados"} sin anomalías (${engineName})`,
      );
    }
  }

  const { isOnline, pendientes, sincronizando, encolar, sincronizar, descartar } = useOfflineSync(
    inventarioId,
    (resultado, texto) => {
      toast.success(`Dictado sincronizado: "${texto}"`);
      aplicarResultado(resultado, true);
    },
  );

  async function handleProcesar(texto: string) {
    setProcesandoVoz(true);
    try {
      const resultado = await api.procesarVoz(inventarioId, texto);
      aplicarResultado(resultado, false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        try {
          await encolar(texto);
          toast.info(
            "Sin conexión: dictado guardado en este dispositivo, se enviará al volver la señal",
          );
        } catch {
          // Último recurso: si ni siquiera IndexedDB funciona (ej. modo incógnito
          // estricto), NO ocultamos el fallo — el operario debe anotarlo a mano.
          toast.error(`No se pudo guardar. ANOTA A MANO: "${texto}"`, { duration: Infinity });
        }
      } else {
        toast.error(err instanceof ApiError ? err.message : "No se pudo procesar el dictado");
      }
    } finally {
      setProcesandoVoz(false);
    }
  }

  async function handleConfirmarAnomalia() {
    if (!anomaliaActual) return;
    try {
      await Promise.all(
        anomaliaActual.alertas.map((a) => api.resolverAlerta(inventarioId, a.id)),
      );
      await cargar();
      toast.success(`Cantidad confirmada: ${anomaliaActual.item.articulo.nombre}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo confirmar la alerta");
    }
  }

  function handleRedictarAnomalia() {
    if (!anomaliaActual) return;
    toast.info(`Vuelve a dictar: ${anomaliaActual.item.articulo.nombre}`);
    setSaltados((prev) => new Set(prev).add(anomaliaActual.item.id));
    setVoiceResetKey((k) => k + 1);
  }

  function handleEstadoActualizado(estado: EstadoInventario) {
    setInventario((prev) => (prev ? { ...prev, estado } : prev));
  }

  if (cargando) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-8">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-40 w-full" />
      </main>
    );
  }

  if (error || !inventario) {
    return (
      <main className="mx-auto max-w-3xl p-4 sm:p-8">
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error ?? "Inventario no encontrado"}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 pb-10 sm:p-8">
      <InventarioHeader inventario={inventario} />

      {/*
        Tablet horizontal (≥1024px, `lg:`) es el uso real esperado en bodega:
        dos columnas para no dejar mitad de la pantalla vacía — control de
        captura a la izquierda (fija mientras se hace scroll), lista de
        ítems + cierre a la derecha, que es lo que más crece.
      */}
      <div className="lg:grid lg:grid-cols-[minmax(320px,420px)_1fr] lg:items-start lg:gap-6">
        <div className="min-w-0 space-y-6 lg:sticky lg:top-6">
          <AuditoriaCiegaCard
            inventario={inventario}
            onCreada={() => void cargar()}
            deshabilitado={procesandoVoz}
          />

          <ColaOfflineIndicator
            isOnline={isOnline}
            pendientes={pendientes}
            sincronizando={sincronizando}
            onSincronizar={() => void sincronizar({ incluirFallidos: true })}
            onDescartar={(id) => void descartar(id)}
          />

          <VoiceCapture
            key={voiceResetKey}
            onProcesar={handleProcesar}
            procesando={procesandoVoz}
            autoFocusTexto={voiceResetKey > 0}
            fuenteIA={ultimaFuenteIA}
          />
        </div>

        <div className="mt-6 min-w-0 space-y-6 lg:mt-0">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Ítems contados ({inventario.items.length})
            </h2>
            {inventario.items.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Aún no hay ítems contados. Usa el dictado por voz para empezar.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {inventario.items.map((item) => (
                  <ItemInventarioCard
                    key={item.id}
                    item={item}
                    alertas={inventario.alertas.filter((a) => a.itemInventarioId === item.id)}
                  />
                ))}
              </div>
            )}
          </section>

          <AccionesCierre inventario={inventario} onEstadoActualizado={handleEstadoActualizado} />
        </div>
      </div>

      <AnomaliaModal
        entrada={anomaliaActual}
        total={anomaliasPendientes.length}
        onConfirmar={handleConfirmarAnomalia}
        onRedictar={handleRedictarAnomalia}
      />
    </main>
  );
}
