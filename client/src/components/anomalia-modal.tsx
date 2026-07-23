"use client";

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
  return (
    <Dialog
      open={entrada !== null}
      onOpenChange={(open) => {
        if (!open) onRedictar();
      }}
    >
      <DialogContent onInteractOutside={(e) => e.preventDefault()}>
        {entrada && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
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
