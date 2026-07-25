"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCantidad } from "@/lib/format";
import type { AlertaInventario, ItemInventario } from "@/lib/types";

export interface AnomaliaModalEntrada {
  item: ItemInventario;
  alertas: AlertaInventario[];
}

export function AnomaliaModal({
  entrada,
  total,
  onConfirmar,
  onRedictar,
}: {
  entrada: AnomaliaModalEntrada | null;
  total: number;
  onConfirmar: () => void;
  onRedictar: () => void;
}) {
  // Emite una pulsación háptica al cargar por primera vez una anomalía (evitando ejecuciones múltiples)
  useEffect(() => {
    if (entrada !== null) {
      try {
        if (
          typeof navigator !== "undefined" &&
          typeof navigator.vibrate === "function"
        ) {
          // navigator.vibrate(200) puede fallar o lanzar intervención si no hay interacción previa.
          // Se captura en un bloque try/catch para evitar romper el hilo de ejecución/render de React.
          navigator.vibrate(200);
        }
      } catch {
        // Intervención del navegador o falta de soporte para la API de vibración (captura silenciosa)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entrada?.item.id]); // Solo se dispara cuando el id del item cambia, previniendo loops infinitos en re-renders.

  return (
    <Dialog
      open={entrada !== null}
      onOpenChange={(open) => {
        if (!open) onRedictar();
      }}
    >
      {/*
        `animate-pulse-ring` es una animación CSS infinita (ver tailwind.config.ts):
        Radix usa el evento `animationend` sobre este mismo nodo para saber cuándo
        terminó la animación de salida y desmontarlo. Una animación infinita nunca
        dispara `animationend`, así que el modal quedaba fantasma en el DOM (overlay
        de pantalla completa bloqueando clics) después de confirmar/cerrar. El pulso
        va en el ícono, no en el DialogContent.
      */}
      <DialogContent
        className="border-destructive/50"
        onInteractOutside={(e) => e.preventDefault()}
      >
        {entrada && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5 animate-pulse-ring" />
                ¿Confirmas {formatCantidad(entrada.item.conteoFisico, entrada.item.unidadUsada)} de{" "}
                {entrada.item.articulo.nombre}?
              </DialogTitle>
              <DialogDescription>
                {entrada.item.articulo.stockHistoricoAvg !== null
                  ? `Promedio habitual: ${formatCantidad(entrada.item.articulo.stockHistoricoAvg, entrada.item.articulo.unidadEstd)}`
                  : "Este artículo no tiene promedio histórico registrado."}
                {total > 1 ? ` · Quedan ${total} anomalía(s) por revisar` : ""}
              </DialogDescription>
            </DialogHeader>

            <ul className="space-y-1.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {entrada.alertas.map((alerta) => (
                <li key={alerta.id} className="flex gap-2">
                  <span aria-hidden>•</span>
                  {alerta.mensaje}
                </li>
              ))}
            </ul>

            <p className="text-xs text-muted-foreground">
              Este inventario no podrá consolidarse hasta que confirmes o corrijas esta anomalía.
            </p>

            <DialogFooter>
              <Button variant="outline" onClick={onRedictar}>
                Re-dictar / Corregir
              </Button>
              <Button variant="destructive" onClick={onConfirmar}>
                Confirmar Cantidad
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
