"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import {
  type DictadoPendiente,
  encolarDictado,
  eliminarPendiente,
  listarPendientes,
  registrarIntentoFallido,
} from "@/lib/offline-queue";
import type { ProcesarTomaPorVozResult } from "@/lib/types";

const INTERVALO_REINTENTO_MS = 8000;

/**
 * Gestiona la cola offline de dictados para un inventario: detecta
 * conectividad, reproduce los pendientes contra el backend en cuanto hay
 * señal (evento 'online' + poll de respaldo cada 8s) y expone `encolar`
 * para que la UI guarde localmente cuando el envío directo falla por red.
 *
 * Distinción clave para no perder datos en silencio: un ítem con
 * `intentos === 0` está "esperando conexión" (red caída, se reintenta
 * solo). Un ítem con `intentos > 0` ya llegó al backend y este lo
 * rechazó (ej. inventario cerrado) — reintentarlo automáticamente cada
 * 8s no lo va a arreglar, así que se saca del auto-retry y solo se
 * reintenta si el operario lo pide explícitamente (`incluirFallidos`).
 */
export function useOfflineSync(
  inventarioId: string,
  onSincronizado: (resultado: ProcesarTomaPorVozResult, texto: string) => void,
) {
  const [isOnline, setIsOnline] = useState(true);
  const [pendientes, setPendientes] = useState<DictadoPendiente[]>([]);
  const [sincronizando, setSincronizando] = useState(false);
  const sincronizandoRef = useRef(false);
  const onSincronizadoRef = useRef(onSincronizado);

  useEffect(() => {
    onSincronizadoRef.current = onSincronizado;
  }, [onSincronizado]);

  const refrescarPendientes = useCallback(async () => {
    try {
      setPendientes(await listarPendientes(inventarioId));
    } catch {
      // IndexedDB no disponible (ej. incógnito estricto): degradar en silencio.
    }
  }, [inventarioId]);

  const sincronizar = useCallback(
    async (opts: { incluirFallidos?: boolean } = {}) => {
      if (sincronizandoRef.current) return;
      sincronizandoRef.current = true;
      setSincronizando(true);
      try {
        const cola = await listarPendientes(inventarioId).catch(() => []);
        const aProcesar = opts.incluirFallidos ? cola : cola.filter((i) => i.intentos === 0);

        for (const item of aProcesar) {
          if (typeof navigator !== "undefined" && !navigator.onLine) break;
          try {
            const resultado = await api.procesarVoz(item.inventarioId, item.texto);
            if (item.id !== undefined) await eliminarPendiente(item.id);
            onSincronizadoRef.current(resultado, item.texto);
          } catch (err) {
            if (err instanceof ApiError && err.status === 0) {
              break; // seguimos sin conexión real: reintentar más tarde
            }
            if (item.id !== undefined) {
              await registrarIntentoFallido(
                item.id,
                err instanceof ApiError ? err.message : "Error desconocido",
              );
            }
          }
        }
      } finally {
        sincronizandoRef.current = false;
        setSincronizando(false);
        await refrescarPendientes();
      }
    },
    [inventarioId, refrescarPendientes],
  );

  const encolar = useCallback(
    async (texto: string) => {
      await encolarDictado(inventarioId, texto);
      await refrescarPendientes();
    },
    [inventarioId, refrescarPendientes],
  );

  const descartar = useCallback(
    async (id: number) => {
      await eliminarPendiente(id);
      await refrescarPendientes();
    },
    [refrescarPendientes],
  );

  useEffect(() => {
    setIsOnline(navigator.onLine);
    void refrescarPendientes();

    function handleOnline() {
      setIsOnline(true);
      void sincronizar();
    }
    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if (navigator.onLine) void sincronizar();

    const interval = setInterval(() => {
      if (navigator.onLine) void sincronizar();
    }, INTERVALO_REINTENTO_MS);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, [refrescarPendientes, sincronizar]);

  return { isOnline, pendientes, sincronizando, encolar, sincronizar, descartar };
}
