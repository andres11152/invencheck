import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { EstadoInventario } from "@invencheck/shared";
import { Badge } from "@/components/ui/badge";
import { formatFecha } from "@/lib/format";
import type { InventarioDetalle } from "@/lib/types";
import { InvenCheckLogo } from "@/components/invencheck-logo";

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
  // Ítems con al menos una alerta activa — no `item.esAnomalia`, que puede
  // quedar en `false` mientras una alerta vieja sigue activa (ver el
  // comentario en item-inventario-card.tsx). `!a.resuelto` es igual de
  // necesario acá: sin filtrarlo, este conteo (y el de abajo) suma también
  // alertas de ciclos ya cerrados, mostrando un total histórico bajo la
  // etiqueta "Alertas activas".
  const alertasActivas = inventario.alertas.filter((a) => !a.resuelto);
  const itemIdsConAlerta = new Set(alertasActivas.map((a) => a.itemInventarioId));
  const totalAnomalias = inventario.items.filter((i) => itemIdsConAlerta.has(i.id)).length;

  return (
    <header className="space-y-3">
      {/* Breadcrumb con color de marca en hover */}
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-secondary"
      >
        <ArrowLeft className="h-4 w-4" />
        Bodegas
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Logo InvenCheck */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary p-1.5 shadow-md">
            <InvenCheckLogo variant="color" size="sm" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              {inventario.almacen.nombre}
            </h1>
            <p className="font-mono text-xs text-muted-foreground">
              Fecha de corte: {formatFecha(inventario.fechaCorte)}
            </p>
          </div>
        </div>
        <Badge variant={ESTADO_TONO[inventario.estado]} className="text-sm">
          {ESTADO_LABEL[inventario.estado]}
        </Badge>
      </div>

      {/* Estadísticas con acento de marca en el valor */}
      <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
        <div className="rounded-xl border border-border/70 bg-card/65 p-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <p className="text-xs text-muted-foreground">Ítems contados</p>
          <p className="font-mono text-2xl font-bold text-foreground">
            {inventario.items.length}
          </p>
        </div>
        <div className="rounded-xl border border-border/70 bg-card/65 p-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <p className="text-xs text-muted-foreground">Alertas activas</p>
          <p className="font-mono text-2xl font-bold text-destructive">
            {alertasActivas.length}
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
