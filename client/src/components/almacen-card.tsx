"use client";

import { Warehouse } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
        "cursor-pointer p-4 transition-all hover:border-primary/60 hover:bg-accent/40",
        seleccionado && "border-primary bg-accent/60 ring-2 ring-primary",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary",
            seleccionado && "bg-primary text-primary-foreground",
          )}
        >
          <Warehouse className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium leading-tight">{almacen.nombre}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{almacen.codigo}</p>
          <Badge variant="secondary" className="mt-2">
            {almacen.unidad}
          </Badge>
        </div>
      </div>
    </Card>
  );
}
