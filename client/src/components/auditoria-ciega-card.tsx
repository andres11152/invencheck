"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ClipboardCheck, Copy, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { ComparacionAuditoriaResult, InventarioDetalle } from "@/lib/types";
import { formatCantidad } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function AuditoriaCiegaCard({
  inventario,
  onCreada,
  deshabilitado = false,
}: {
  inventario: InventarioDetalle;
  onCreada?: () => void;
  /** true mientras haya un dictado en curso en esta misma página (evita que
   * dos escrituras concurrentes sobre `inventario` se pisen entre sí). */
  deshabilitado?: boolean;
}) {
  const [auditorId, setAuditorId] = useState("");
  const [creando, setCreando] = useState(false);
  const [linkAuditoria, setLinkAuditoria] = useState<string | null>(null);

  const [comparacion, setComparacion] = useState<ComparacionAuditoriaResult | null>(null);
  const [cargandoComparacion, setCargandoComparacion] = useState(false);
  const [mostrarComparacion, setMostrarComparacion] = useState(false);

  // Este inventario ES la auditoría ciega de otro: no mostrar controles de
  // "iniciar auditoría" aquí (no tiene sentido auditar una auditoría), solo
  // un aviso de contexto — sin revelar los conteos del original.
  if (inventario.auditaA) {
    return (
      <Card className="border-primary/40 bg-primary/[0.06]">
        <CardContent className="flex items-start gap-3 p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium">Estás en una auditoría ciega</p>
            <p className="text-sm text-muted-foreground">
              Cuenta {inventario.auditaA.almacen.nombre} de forma independiente — no verás los
              números del operario original hasta que se compare.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  async function iniciarAuditoria() {
    if (!auditorId.trim()) {
      toast.error("Escribe el nombre o id del auditor");
      return;
    }
    setCreando(true);
    try {
      const auditoria = await api.crearAuditoriaCiega(inventario.id, auditorId.trim());
      const url = `${window.location.origin}/inventario/${auditoria.id}`;
      setLinkAuditoria(url);
      toast.success("Auditoría ciega creada");
      onCreada?.();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo crear la auditoría");
    } finally {
      setCreando(false);
    }
  }

  async function copiarLink() {
    if (!linkAuditoria) return;
    await navigator.clipboard.writeText(linkAuditoria);
    toast.success("Link copiado");
  }

  async function toggleComparacion() {
    if (mostrarComparacion) {
      setMostrarComparacion(false);
      return;
    }
    setMostrarComparacion(true);
    setCargandoComparacion(true);
    try {
      setComparacion(await api.getComparacionAuditoria(inventario.id));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo cargar la comparación");
    } finally {
      setCargandoComparacion(false);
    }
  }

  // Se acaba de crear en esta sesión: mostrar el link para compartir aunque
  // el padre ya haya refrescado `inventario.auditoriaCiega` (si no,
  // desaparecería antes de que alcancen a copiarlo).
  if (linkAuditoria) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Auditoría ciega
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/[0.06] p-3">
            <Label>Comparte este link con el auditor (otro dispositivo)</Label>
            <div className="flex gap-2">
              <Input readOnly value={linkAuditoria} className="text-xs" />
              <Button size="icon" variant="outline" onClick={copiarLink}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sin auditoría todavía: ofrecer crearla.
  if (!inventario.auditoriaCiega) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Auditoría ciega
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Un segundo operario cuenta esta misma bodega de forma independiente, sin ver estos
            números, y al final se comparan.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={auditorId}
              onChange={(e) => setAuditorId(e.target.value)}
              placeholder="Nombre o id del auditor"
            />
            <Button onClick={iniciarAuditoria} disabled={creando || deshabilitado}>
              {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
              Iniciar Auditoría Ciega
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Ya hay una auditoría en curso o terminada.
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Auditoría ciega en curso
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            Auditor: <span className="font-medium text-foreground">{inventario.auditoriaCiega.usuarioId}</span>
          </span>
          <Badge variant="secondary">{inventario.auditoriaCiega.estado}</Badge>
        </div>

        <Button variant="outline" onClick={toggleComparacion} disabled={cargandoComparacion}>
          {cargandoComparacion ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : mostrarComparacion ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
          {mostrarComparacion ? "Ocultar comparación" : "Ver comparación"}
        </Button>

        {mostrarComparacion && comparacion && (
          <div className="space-y-2">
            {comparacion.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                El auditor todavía no ha contado ningún artículo.
              </p>
            ) : (
              comparacion.items.map((item, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-lg border p-3",
                    item.coincide
                      ? "border-success/40 bg-success/[0.06]"
                      : "border-destructive/40 bg-destructive/[0.06]",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{item.articulo.nombre}</p>
                    <Badge variant={item.coincide ? "success" : "destructive"}>
                      {item.coincide ? "Coincide" : "Discrepancia"}
                    </Badge>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Original</p>
                      <p className="font-semibold">
                        {item.conteoOriginal !== null
                          ? formatCantidad(item.conteoOriginal, item.unidad)
                          : "— no contado"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Auditoría</p>
                      <p className="font-semibold">
                        {item.conteoAuditoria !== null
                          ? formatCantidad(item.conteoAuditoria, item.unidad)
                          : "— no contado"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Diferencia</p>
                      <p className={cn("font-semibold", !item.coincide && "text-destructive")}>
                        {item.diferencia !== null
                          ? `${item.diferencia > 0 ? "+" : ""}${formatCantidad(item.diferencia, item.unidad)}`
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
