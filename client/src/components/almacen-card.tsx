"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InvenCheckLogo } from "@/components/invencheck-logo";
import { cn } from "@/lib/utils";
import type { Almacen } from "@/lib/types";

export function AlmacenCard({
  almacen,
  seleccionado,
  onSelect,
}: {
  almacen: Almacen;
  seleccionado: boolean;
  onSelect: () => void;
}) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect()}
      className={cn(
        /* Estado base: borde sutil, transición suave + lift de hover */
        "cursor-pointer p-4 transition-all duration-200",
        "hover:-translate-y-0.5 hover:border-primary/50 hover:bg-accent/40 hover:shadow-lg active:translate-y-0",
        /* Estado seleccionado: azul primario + anillo amarillo */
        seleccionado && [
          "border-primary bg-primary/10",
          "ring-2 ring-secondary ring-offset-1 ring-offset-background",
          "shadow-lg shadow-primary/20",
        ],
      )}
    >
      <div className="flex items-start gap-3">
        {/* Logo InvenCheck: sobre bg-secondary/20 en reposo → bg-primary al seleccionar */}
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg p-1.5 transition-colors duration-200",
            seleccionado
              ? "bg-primary"         /* Azul */
              : "bg-secondary/20",   /* Amarillo tenue */
          )}
        >
          <InvenCheckLogo variant="color" size="xs" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight">{almacen.nombre}</p>
          <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
            {almacen.codigo}
          </p>
          <Badge
            variant="secondary"
            className={cn(
              "mt-2 text-xs",
              /* Unidades de negocio con color de acento amarillo */
              seleccionado && "bg-secondary text-secondary-foreground",
            )}
          >
            {almacen.unidad}
          </Badge>
        </div>
      </div>
    </Card>
  );
}
