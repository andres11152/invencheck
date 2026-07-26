"use client";

import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertaBadge } from "@/components/alerta-badge";
import type { AlertaInventario } from "@/lib/types";

/**
 * Gate real de segregación de funciones: alertas que el operario ya confirmó
 * (`resuelto: true`) pero que todavía nadie con rol AUDITOR/ADMIN revisó
 * (`revisadoPorAuditor: false`). Sin marcarlas aquí, `cambiarEstado` sigue
 * bloqueado — el auto-chequeo del operario (modal de anomalía) ya NO alcanza
 * por sí solo para desbloquear la consolidación.
 */
export function AlertasRevisionAuditor({
  inventarioId,
  alertas,
  onRevisada,
}: {
  inventarioId: string;
  alertas: AlertaInventario[];
  onRevisada: () => void;
}) {
  const pendientes = alertas.filter((a) => a.resuelto && !a.revisadoPorAuditor);
  const [revisandoId, setRevisandoId] = useState<string | null>(null);

  if (pendientes.length === 0) return null;

  async function revisar(alertaId: string) {
    setRevisandoId(alertaId);
    try {
      await api.revisarAlerta(inventarioId, alertaId);
      toast.success("Alerta revisada");
      onRevisada();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo revisar la alerta");
    } finally {
      setRevisandoId(null);
    }
  }

  return (
    <Card className="border-primary/40 bg-primary/[0.06]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-5 w-5" />
          Alertas pendientes de tu revisión ({pendientes.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          El operario ya confirmó estas cantidades, pero el inventario no puede consolidarse hasta
          que las revises de forma independiente.
        </p>
        {pendientes.map((alerta) => (
          <div
            key={alerta.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2.5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <AlertaBadge tipo={alerta.tipo} />
              <span className="text-sm text-muted-foreground">{alerta.mensaje}</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={revisandoId === alerta.id}
              onClick={() => void revisar(alerta.id)}
            >
              {revisandoId === alerta.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Marcar revisada"
              )}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
