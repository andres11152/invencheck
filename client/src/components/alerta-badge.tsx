import type { TipoAlerta } from "@invencheck/shared";
import { Badge } from "@/components/ui/badge";
import { TIPO_ALERTA_ICON, TIPO_ALERTA_LABEL, tonoAlerta } from "@/lib/format";

export function AlertaBadge({ tipo, detalle }: { tipo: TipoAlerta; detalle?: string }) {
  return (
    <Badge variant={tonoAlerta(tipo)} className="animate-in zoom-in-75 fade-in-0 duration-300">
      <span aria-hidden>{TIPO_ALERTA_ICON[tipo]}</span>
      {TIPO_ALERTA_LABEL[tipo]}
      {detalle ? ` · ${detalle}` : ""}
    </Badge>
  );
}
