import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { EstadoInventario } from "@invencheck/shared";
import { Badge } from "@/components/ui/badge";
import { formatFecha } from "@/lib/format";
import type { InventarioDetalle } from "@/lib/types";

const ESTADO_TONO: Record<EstadoInventario, "secondary" | "warning" | "success" | "default"> = {
  BORRADOR: "secondary",
  EN_AUDITORIA: "warning",
  CONCILIADO: "success",
  ENVIADO_ERP: "default",
};

const ESTADO_LABEL: Record<EstadoInventario, string> = {
  BORRADOR: "Borrador",
  EN_AUDITORIA: "En auditoría",
  CONCILIADO: "Conciliado",
  ENVIADO_ERP: "Enviado a ERP",
};

export function InventarioHeader({ inventario }: { inventario: InventarioDetalle }) {
  const totalAnomalias = inventario.items.filter((i) => i.esAnomalia).length;

  return (
    <header className="space-y-3">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Bodegas
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">{inventario.almacen.nombre}</h1>
          <p className="text-sm text-muted-foreground">
            Fecha de corte: {formatFecha(inventario.fechaCorte)}
          </p>
        </div>
        <Badge variant={ESTADO_TONO[inventario.estado]} className="text-sm">
          {ESTADO_LABEL[inventario.estado]}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Ítems contados</p>
          <p className="text-2xl font-bold">{inventario.items.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Alertas activas</p>
          <p className="text-2xl font-bold text-destructive">
            {inventario.alertas.length}
            {totalAnomalias > 0 && (
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                ({totalAnomalias} ítem{totalAnomalias === 1 ? "" : "s"})
              </span>
            )}
          </p>
        </div>
      </div>
    </header>
  );
}
