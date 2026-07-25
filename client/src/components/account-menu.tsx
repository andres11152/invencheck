"use client";

import { LogOut } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { RolUsuario } from "@/lib/types";

/** Color del avatar por rol: mismo tono que su badge, para que se lean como un solo sistema. */
const ROL_AVATAR_CLASS: Record<RolUsuario, string> = {
  OPERARIO: "bg-primary text-primary-foreground",
  AUDITOR: "bg-warning text-warning-foreground",
  ADMIN: "bg-destructive text-destructive-foreground",
};

const ROL_BADGE_VARIANT: Record<RolUsuario, "default" | "warning" | "destructive"> = {
  OPERARIO: "default",
  AUDITOR: "warning",
  ADMIN: "destructive",
};

const ROL_LABEL: Record<RolUsuario, string> = {
  OPERARIO: "Operario",
  AUDITOR: "Auditor",
  ADMIN: "Administrador",
};

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[1][0]).toUpperCase();
}

export function AccountMenu() {
  const { usuario, logout } = useAuth();
  if (!usuario) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Cuenta"
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold shadow-sm transition-all duration-200 hover:scale-105 hover:opacity-90 hover:shadow-md active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            ROL_AVATAR_CLASS[usuario.rol],
          )}
        >
          {iniciales(usuario.nombre)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="space-y-2 font-normal">
          <div className="space-y-0.5">
            <p className="truncate text-sm font-medium text-foreground">{usuario.nombre}</p>
            <p className="truncate text-xs text-muted-foreground">{usuario.email}</p>
          </div>
          <Badge variant={ROL_BADGE_VARIANT[usuario.rol]}>{ROL_LABEL[usuario.rol]}</Badge>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
          <LogOut className="h-4 w-4" />
          Cerrar Sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
