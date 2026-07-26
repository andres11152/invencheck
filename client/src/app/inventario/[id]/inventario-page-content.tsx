"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Mic, Zap } from "lucide-react";
import { toast } from "sonner";
import type { EstadoInventario } from "@invencheck/shared";

import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { InventarioDetalle, ProcesarTomaPorVozResult } from "@/lib/types";
import { useOfflineSync } from "@/hooks/use-offline-sync";
import { InventarioHeader } from "@/components/inventario-header";
import { VoiceCapture } from "@/components/voice-capture";
import { ItemInventarioCard } from "@/components/item-inventario-card";
import { AnomaliaModal } from "@/components/anomalia-modal";
import { AccionesCierre } from "@/components/acciones-cierre";
import { ColaOfflineIndicator } from "@/components/cola-offline-indicator";
import { AuditoriaCiegaCard } from "@/components/auditoria-ciega-card";
import { AlertasRevisionAuditor } from "@/components/alertas-revision-auditor";
import {
  ItemsNoMatcheadosCard,
  type NoMatcheadoPendiente,
} from "@/components/items-no-matcheados-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/components/auth-provider";

export function InventarioPageContent({ params }: { params: { id: string } }) {
  const { usuario } = useAuth();
  const inventarioId = params.id;

  const [inventario, setInventario] = useState<InventarioDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [procesandoVoz, setProcesandoVoz] = useState(false);
  const [voiceResetKey, setVoiceResetKey] = useState(0);
  const [ultimaFuenteIA, setUltimaFuenteIA] = useState<
    "GEMINI" | "REGLAS_LOCALES" | "ESCANER_SKU" | "SELECCION_MANUAL" | null
  >(null);

  // Cola de ids de ItemInventario con anomalía pendiente de revisar (por
  // dictado nuevo o por click manual en una card). Se deriva la entrada
  // mostrada del `inventario` actual, así que al confirmar/recargar y
  // desaparecer la anomalía resuelta, automáticamente avanza a la siguiente
  // de la cola sin lógica adicional.
  const [anomaliaColaIds, setAnomaliaColaIds] = useState<string[]>([]);

  // Ítems dictados que no se guardaron (sin match o ambiguos entre variantes
  // del catálogo) — nunca llegan a existir como ItemInventario en el
  // servidor, así que esta cola vive solo en el cliente mientras dura la
  // sesión de conteo (ver ItemsNoMatcheadosCard).
  const [noMatcheadosCola, setNoMatcheadosCola] = useState<NoMatcheadoPendiente[]>([]);

  const anomaliaModalEntrada = useMemo(() => {
    if (!inventario) return null;
    for (const id of anomaliaColaIds) {
      const item = inventario.items.find((i) => i.id === id);
      // No se filtra por `item.esAnomalia`: ese campo refleja solo la
      // ÚLTIMA evaluación, y puede quedar en `false` mientras una alerta
      // vieja (de cuando sí aplicaba) sigue activa por algún motivo — lo
      // que de verdad importa para decidir si hay algo que mostrar es si
      // quedan alertas sin confirmar, no ese booleano por separado.
      if (!item) continue;
      // Solo alertas que el operario TODAVÍA no confirmó — una vez confirmadas
      // (resuelto: true) quedan pendientes de revisión por un auditor, pero
      // ya no deben reabrir este modal de auto-chequeo (ver AlertasRevisionAuditor).
      const alertas = inventario.alertas.filter(
        (a) => a.itemInventarioId === id && !a.resuelto,
      );
      if (alertas.length > 0) return { item, alertas };
    }
    return null;
  }, [inventario, anomaliaColaIds]);

  // Ids de ItemInventario que acaban de aparecer por el último dictado
  // procesado: solo estos reciben la animación de entrada.
  const [recienAgregados, setRecienAgregados] = useState<Set<string>>(new Set());

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

  // Cuenta ítems con alguna alerta activa sin confirmar (no `item.esAnomalia`
  // — ver el comentario en `anomaliaModalEntrada` sobre por qué ese campo
  // puede quedar desalineado de las alertas reales).
  const anomaliasTotalesCount = useMemo(() => {
    if (!inventario) return 0;
    const itemIdsConAlerta = new Set(
      inventario.alertas.filter((a) => !a.resuelto).map((a) => a.itemInventarioId),
    );
    return inventario.items.filter((item) => itemIdsConAlerta.has(item.id)).length;
  }, [inventario]);

  function aplicarResultado(resultado: ProcesarTomaPorVozResult, origenOffline: boolean) {
    const idsPrevios = new Set(inventario?.items.map((i) => i.id) ?? []);
    const idsNuevos = resultado.inventario.items
      .map((i) => i.id)
      .filter((id) => !idsPrevios.has(id));

    setInventario(resultado.inventario);
    setUltimaFuenteIA(resultado.fuenteIA);

    if (idsNuevos.length > 0) {
      setRecienAgregados((prev) => new Set(Array.from(prev).concat(idsNuevos)));
      window.setTimeout(() => {
        setRecienAgregados((prev) => {
          const next = new Set(prev);
          idsNuevos.forEach((id) => next.delete(id));
          return next;
        });
      }, 350);
    }

    // Antes esto era un toast por ítem (6s y desaparecía sin dejar rastro):
    // si el operario no lo alcanzaba a leer mientras seguía dictando —el
    // caso de uso normal, sin mirar la pantalla— el ítem quedaba perdido
    // sin que nadie se enterara. Ahora queda en una cola persistente
    // (ItemsNoMatcheadosCard) hasta que se re-dicte o se descarte a mano.
    if (resultado.itemsNoMatcheados.length > 0) {
      setNoMatcheadosCola((prev) => [
        ...prev,
        ...resultado.itemsNoMatcheados.map((item) => ({
          ...item,
          id: crypto.randomUUID(),
        })),
      ]);
      toast.warning(
        resultado.itemsNoMatcheados.length === 1
          ? `"${resultado.itemsNoMatcheados[0].articuloBusqueda}" necesita que lo precises — revisa abajo`
          : `${resultado.itemsNoMatcheados.length} ítems necesitan que los precises — revisa abajo`,
      );
    }

    // Si la captura trajo una o más anomalías, encolamos TODOS los ítems
    // anómalos de esta captura (no solo el primero) para que el modal los
    // vaya mostrando uno tras otro al confirmar/redictar cada uno.
    const idsAnomalos = resultado.itemsMatcheados
      .filter((i) => i.esAnomalia)
      .map(
        (resumen) =>
          resultado.inventario.items.find((i) => i.articuloId === resumen.articulo.id)?.id,
      )
      .filter((id): id is string => Boolean(id));

    if (idsAnomalos.length > 0) {
      setAnomaliaColaIds(idsAnomalos);
    } else if (resultado.itemsMatcheados.length > 0) {
      const engineName =
        resultado.fuenteIA === "GEMINI"
          ? "Gemini AI"
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
          toast.error(`No se pudo guardar. ANOTA A MANO: "${texto}"`, { duration: Infinity });
        }
      } else {
        toast.error(err instanceof ApiError ? err.message : "No se pudo procesar el dictado");
      }
    } finally {
      setProcesandoVoz(false);
    }
  }

  // A diferencia de handleProcesar, no encola offline: identificar el
  // artículo por SKU requiere ir al servidor sí o sí (no hay parser local
  // equivalente para códigos de barras), así que sin conexión se le pide al
  // operario usar dictado por voz/texto, que sí tiene fallback offline.
  async function handleProcesarSku(sku: string, cantidad: number) {
    setProcesandoVoz(true);
    try {
      const resultado = await api.procesarSku(inventarioId, { sku, cantidad });
      aplicarResultado(resultado, false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        toast.error("Sin conexión: el escaneo por SKU necesita señal. Usa dictado por voz/texto.");
      } else {
        toast.error(err instanceof ApiError ? err.message : "No se pudo procesar el SKU escaneado");
      }
    } finally {
      setProcesandoVoz(false);
    }
  }

  // Selección manual directa de un candidato ambiguo — rompe el loop de
  // re-dictar cuando un candidato es prefijo exacto de otro ("PAPA CRIOLLA"
  // / "PAPA CRIOLLA PRECOCIDA"): no hay ninguna frase que se pueda decir
  // por voz para elegir el corto sin reproducir la MISMA ambigüedad.
  async function handleElegirCandidato(
    item: NoMatcheadoPendiente,
    articuloId: string,
  ) {
    // Igual que handleProcesar/handleProcesarSku: marca procesandoVoz para
    // deshabilitar el dictado por voz/texto mientras esta escritura está en
    // vuelo. Sin esto, aplicarResultado hace setInventario(snapshot completo)
    // con lo que devuelva CADA request — un dictado concurrente disparado
    // mientras esta selección seguía pendiente podía responder primero y
    // luego ser pisado por esta respuesta más lenta, perdiendo en pantalla
    // el ítem que sí se había registrado.
    setProcesandoVoz(true);
    try {
      const resultado = await api.procesarArticulo(inventarioId, {
        articuloId,
        cantidad: item.cantidadDictada,
        unidadDictada: item.unidadDictada,
      });
      aplicarResultado(resultado, false);
      setNoMatcheadosCola((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo registrar el artículo elegido");
    } finally {
      setProcesandoVoz(false);
    }
  }

  async function handleConfirmarAnomalia() {
    if (!anomaliaModalEntrada) return;
    try {
      await Promise.all(
        anomaliaModalEntrada.alertas.map((a) => api.resolverAlerta(inventarioId, a.id)),
      );
      setAnomaliaColaIds((prev) => prev.filter((id) => id !== anomaliaModalEntrada.item.id));
      await cargar();
      toast.success(`Cantidad confirmada: ${anomaliaModalEntrada.item.articulo.nombre}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo confirmar la alerta");
    }
  }

  function handleRedictarAnomalia() {
    if (!anomaliaModalEntrada) return;
    // Se saca de la cola solo para esta visita (no se resuelve la alerta):
    // si hay más anomalías encoladas, el modal avanza a la siguiente; si el
    // operario recarga o vuelve más tarde, esta reaparece porque sigue sin
    // resolverse en el servidor.
    setAnomaliaColaIds((prev) => prev.filter((id) => id !== anomaliaModalEntrada.item.id));
    setVoiceResetKey((k) => k + 1);
  }

  function handleReintentarNoMatcheado(id: string) {
    setNoMatcheadosCola((prev) => prev.filter((item) => item.id !== id));
    setVoiceResetKey((k) => k + 1);
  }

  function handleDescartarNoMatcheado(id: string) {
    setNoMatcheadosCola((prev) => prev.filter((item) => item.id !== id));
  }

  function handleEstadoActualizado(estado: EstadoInventario) {
    setInventario((prev) => (prev ? { ...prev, estado } : prev));
  }

  if (cargando) {
    return (
      <main className="mx-auto max-w-6xl space-y-6 p-4 pb-10 sm:p-8">
        {/* Skeleton con la silueta real del header (ícono + título + 2 stat tiles),
         * no bloques genéricos — se lee como un placeholder del contenido real. */}
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
          </div>
        </div>

        <div className="lg:grid lg:grid-cols-[minmax(320px,420px)_1fr] lg:items-start lg:gap-6">
          <div className="min-w-0 space-y-6">
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
          <div className="mt-6 min-w-0 space-y-6 lg:mt-0">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full rounded-2xl" />
              ))}
            </div>
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
        </div>
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

      {usuario?.rol !== "OPERARIO" && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-[#FFD000] shadow-[0_4px_20px_-4px_rgba(255,208,0,0.15)] animate-in fade-in slide-in-from-top-2 duration-300">
          <Zap className="h-5 w-5 text-secondary animate-pulse shrink-0" />
          <div>
            <p className="font-semibold text-foreground">Modo Contingencia (Superusuario) Activo</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Estás registrando conteos en esta toma física utilizando privilegios globales de {usuario?.rol === "ADMIN" ? "Administrador" : "Auditor"}.
            </p>
          </div>
        </div>
      )}

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
            onEscanearSku={handleProcesarSku}
            procesando={procesandoVoz}
            autoFocusTexto={voiceResetKey > 0}
            fuenteIA={ultimaFuenteIA}
          />

          <ItemsNoMatcheadosCard
            items={noMatcheadosCola}
            onReintentar={handleReintentarNoMatcheado}
            onDescartar={handleDescartarNoMatcheado}
            onElegirCandidato={handleElegirCandidato}
          />
        </div>

        <div className="mt-6 min-w-0 space-y-6 lg:mt-0">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Ítems contados ({inventario.items.length})
            </h2>
            {inventario.items.length === 0 ? (
              <EmptyState
                icon={Mic}
                title="Aún no has contado nada aquí"
                description="Dicta o escribe lo que ves en la bodega — el primer ítem aparece apenas lo proceses."
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {inventario.items.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      recienAgregados.has(item.id) &&
                        "animate-in fade-in slide-in-from-bottom-2 duration-300",
                    )}
                  >
                    <ItemInventarioCard
                      item={item}
                      esCiego={usuario?.rol === "OPERARIO"}
                      alertas={inventario.alertas.filter((a) => a.itemInventarioId === item.id)}
                      onRevisarAnomalia={() => {
                        // Prioriza este ítem en la cola sin perder el resto de anomalías pendientes.
                        setAnomaliaColaIds((prev) => [
                          item.id,
                          ...prev.filter((id) => id !== item.id),
                        ]);
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          {usuario?.rol !== "OPERARIO" && (
            <AlertasRevisionAuditor
              inventarioId={inventario.id}
              alertas={inventario.alertas}
              onRevisada={() => void cargar()}
            />
          )}

          <AccionesCierre inventario={inventario} onEstadoActualizado={handleEstadoActualizado} />
        </div>
      </div>

      <AnomaliaModal
        entrada={anomaliaModalEntrada}
        total={anomaliasTotalesCount}
        onConfirmar={handleConfirmarAnomalia}
        onRedictar={handleRedictarAnomalia}
      />
    </main>
  );
}
