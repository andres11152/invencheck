import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertaBadge } from "@/components/alerta-badge";
import { calcularMerma, formatCantidad, formatNumero } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AlertaInventario, ItemInventario } from "@/lib/types";

export function ItemInventarioCard({
  item,
  alertas,
}: {
  item: ItemInventario;
  alertas: AlertaInventario[];
}) {
  const merma = calcularMerma(item.conteoFisico, item.teorico);
  const mermaTono =
    merma === 0 ? "text-muted-foreground" : merma < 0 ? "text-destructive" : "text-success";

  return (
    <Card
      className={cn(
        "p-4",
        item.esAnomalia && "border-destructive/50 bg-destructive/[0.06]",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium leading-tight">{item.articulo.nombre}</p>
            {item.articulo.esProcesado && <Badge variant="secondary">(PA)</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {item.articulo.sku ? `SKU ${item.articulo.sku}` : "Sin SKU"} · {item.articulo.categoria}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Contado</p>
          <p className="font-semibold">{formatCantidad(item.conteoFisico, item.unidadUsada)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Teórico ERP</p>
          <p className="font-semibold">{formatCantidad(item.teorico, item.unidadUsada)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Merma / Dif.</p>
          <p className={cn("font-semibold", mermaTono)}>
            {merma > 0 ? "+" : ""}
            {formatNumero(merma)}
          </p>
        </div>
      </div>

      {alertas.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {alertas.map((alerta) => (
            <AlertaBadge key={alerta.id} tipo={alerta.tipo} />
          ))}
        </div>
      )}
    </Card>
  );
}
