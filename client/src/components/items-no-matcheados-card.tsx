import { HelpCircle, Mic, X } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCantidad } from "@/lib/format";
import type { ItemNoMatcheado } from "@/lib/types";

export interface NoMatcheadoPendiente extends ItemNoMatcheado {
  /** Id sintético del lado del cliente — estos ítems nunca se guardan en el
   * servidor (no hubo match, no hay ItemInventario), así que no hay un id
   * real que reutilizar para trackearlos en la cola. */
  id: string;
}

/**
 * Reemplaza el toast transitorio que antes era la única señal de un ítem
 * dictado que no se pudo registrar (sin match, o ambiguo entre variantes
 * del catálogo). Un toast de 6s es fácil de perder si el operario no está
 * mirando la pantalla mientras dicta — el caso de uso típico de esta app —
 * así que ahora queda visible en una tarjeta persistente, igual que las
 * anomalías, hasta que el operario la reintente o la descarte a mano.
 */
export function ItemsNoMatcheadosCard({
  items,
  onReintentar,
  onDescartar,
}: {
  items: NoMatcheadoPendiente[];
  onReintentar: (id: string) => void;
  onDescartar: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <Card className="border-warning/40 bg-warning/[0.06]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HelpCircle className="h-5 w-5 text-warning" />
          Sin registrar todavía ({items.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          Estos ítems que dictaste no se guardaron — necesitan que los precises antes de
          contarlos.
        </p>
        {items.map((item) => (
          <div
            key={item.id}
            className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-warning/30 bg-background/60 p-2.5"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">
                &ldquo;{item.articuloBusqueda}&rdquo;
                <span className="ml-1.5 font-normal text-muted-foreground">
                  ({formatCantidad(item.cantidadDictada, item.unidadDictada)})
                </span>
              </p>
              <p className="mt-0.5 text-xs text-warning">{item.motivo}</p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Button size="sm" variant="outline" onClick={() => onReintentar(item.id)}>
                <Mic className="h-3.5 w-3.5" /> Re-dictar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => onDescartar(item.id)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
