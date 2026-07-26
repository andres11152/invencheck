import { useState } from "react";
import { HelpCircle, Loader2, Mic, X } from "lucide-react";

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
 *
 * Cuando hay `candidatos` (ambigüedad real, no "sin coincidencia"), se
 * ofrece elegir directamente en pantalla en vez de solo re-dictar: cuando
 * un candidato es prefijo exacto de otro ("PAPA CRIOLLA" / "PAPA CRIOLLA
 * PRECOCIDA"), no existe ninguna frase que se pueda decir por voz para
 * elegir el corto sin reproducir la MISMA ambigüedad — re-dictar en ese
 * caso entra en loop infinito (bug real reportado y confirmado).
 */
export function ItemsNoMatcheadosCard({
  items,
  onReintentar,
  onDescartar,
  onElegirCandidato,
}: {
  items: NoMatcheadoPendiente[];
  onReintentar: (id: string) => void;
  onDescartar: (id: string) => void;
  onElegirCandidato: (item: NoMatcheadoPendiente, articuloId: string) => Promise<void>;
}) {
  const [eligiendo, setEligiendo] = useState<string | null>(null);

  async function elegir(item: NoMatcheadoPendiente, articuloId: string) {
    setEligiendo(articuloId);
    try {
      await onElegirCandidato(item, articuloId);
    } finally {
      setEligiendo(null);
    }
  }

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
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                &ldquo;{item.articuloBusqueda}&rdquo;
                <span className="ml-1.5 font-normal text-muted-foreground">
                  ({formatCantidad(item.cantidadDictada, item.unidadDictada)})
                </span>
              </p>
              <p className="mt-0.5 text-xs text-warning">{item.motivo}</p>

              {item.candidatos && item.candidatos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {item.candidatos.map((candidato) => (
                    <Button
                      key={candidato.id}
                      size="sm"
                      variant="secondary"
                      disabled={eligiendo !== null}
                      onClick={() => void elegir(item, candidato.id)}
                    >
                      {eligiendo === candidato.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      Es &ldquo;{candidato.nombre}&rdquo;
                    </Button>
                  ))}
                </div>
              )}
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
