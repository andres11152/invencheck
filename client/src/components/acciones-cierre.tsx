"use client";

import { useState } from "react";
import { CheckCircle2, Download, FileJson, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { EstadoInventario } from "@invencheck/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import { descargarArchivo, inventarioToCsv, inventarioToErpJson } from "@/lib/export-erp";
import type { InventarioDetalle } from "@/lib/types";

export function AccionesCierre({
  inventario,
  onEstadoActualizado,
}: {
  inventario: InventarioDetalle;
  onEstadoActualizado: (estado: InventarioDetalle["estado"]) => void;
}) {
  const [consolidando, setConsolidando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const yaConciliado =
    inventario.estado === EstadoInventario.CONCILIADO ||
    inventario.estado === EstadoInventario.ENVIADO_ERP;
  const enviadoAERP = inventario.estado === EstadoInventario.ENVIADO_ERP;
  const alertasActivas = inventario.alertas.length;

  async function consolidar() {
    setConsolidando(true);
    try {
      const actualizado = await api.cambiarEstado(inventario.id, EstadoInventario.CONCILIADO);
      onEstadoActualizado(actualizado.estado);
      toast.success("Inventario consolidado");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo consolidar el inventario");
    } finally {
      setConsolidando(false);
    }
  }

  async function enviarAERP() {
    setEnviando(true);
    try {
      const actualizado = await api.cambiarEstado(inventario.id, EstadoInventario.ENVIADO_ERP);
      onEstadoActualizado(actualizado.estado);
      toast.success("Inventario enviado exitosamente al ERP");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo conectar con el ERP");
    } finally {
      setEnviando(false);
    }
  }

  function exportarCsv() {
    const nombreArchivo = `inventario-${inventario.almacen.codigo}-${inventario.id.slice(0, 8)}.csv`;
    descargarArchivo(inventarioToCsv(inventario), nombreArchivo, "text/csv;charset=utf-8");
    toast.success("CSV exportado");
  }

  function exportarJson() {
    const nombreArchivo = `inventario-${inventario.almacen.codigo}-${inventario.id.slice(0, 8)}.json`;
    descargarArchivo(
      JSON.stringify(inventarioToErpJson(inventario), null, 2),
      nombreArchivo,
      "application/json",
    );
    toast.success("JSON exportado");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cierre de inventario</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {!yaConciliado && alertasActivas > 0 && (
          <p className="rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning">
            No se puede consolidar: hay {alertasActivas} alerta(s) sin confirmar. Revísalas arriba
            antes de cerrar el inventario.
          </p>
        )}
        {enviadoAERP && (
          <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-xs text-emerald-500 font-semibold">
            Este inventario ya fue consolidado y transferido exitosamente al ERP (Oracle/Symphony).
          </p>
        )}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {!enviadoAERP && (
            <Button
              variant={inventario.estado === EstadoInventario.CONCILIADO ? "outline" : "success"}
              disabled={consolidando || yaConciliado || inventario.items.length === 0 || alertasActivas > 0}
              onClick={consolidar}
            >
              {consolidando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {yaConciliado ? "Consolidado" : "Consolidar y Finalizar"}
            </Button>
          )}
          {inventario.estado === EstadoInventario.CONCILIADO && (
            <Button variant="default" disabled={enviando} onClick={enviarAERP}>
              {enviando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Enviar a ERP
            </Button>
          )}
          <Button
            variant="outline"
            disabled={inventario.items.length === 0}
            onClick={exportarCsv}
          >
            <Download className="h-4 w-4" />
            Exportar CSV (ERP/Symphony)
          </Button>
          <Button
            variant="outline"
            disabled={inventario.items.length === 0}
            onClick={exportarJson}
          >
            <FileJson className="h-4 w-4" />
            Exportar JSON
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
