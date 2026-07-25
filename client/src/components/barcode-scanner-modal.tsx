"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function BarcodeScannerModal({
  abierto,
  onCerrar,
  onEscanear,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onEscanear: (textoDictado: string) => void;
}) {
  const [skuDetectado, setSkuDetectado] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [camaraActiva, setCamaraActiva] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!abierto) {
      detenerCamara();
      setSkuDetectado("");
      setCantidad("1");
      return;
    }

    iniciarCamara();

    return () => {
      detenerCamara();
    };
  }, [abierto]);

  async function iniciarCamara() {
    try {
      if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCamaraActiva(true);
      }
    } catch {
      // Si el navegador bloquea la cámara o no hay dispositivo, se permite entrada manual por SKU
      setCamaraActiva(false);
    }
  }

  function detenerCamara() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCamaraActiva(false);
  }

  function handleConfirmar() {
    const sku = skuDetectado.trim();
    const cant = parseFloat(cantidad) || 1;
    if (!sku) {
      toast.error("Ingresa o escanea un SKU / Código de Barras válido");
      return;
    }

    onEscanear(`${cant} unidad de sku ${sku}`);
    onCerrar();
  }

  return (
    <Dialog open={abierto} onOpenChange={(open) => !open && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Camera className="h-5 w-5 text-primary" /> Escáner de Código de Barras / SKU
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Visor de Cámara */}
          <div className="relative flex h-48 w-full items-center justify-center overflow-hidden rounded-xl bg-black/90 border border-border">
            {camaraActiva ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                />
                {/* Cuadro de enfoque de escaneo */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-28 w-44 rounded-lg border-2 border-dashed border-secondary bg-secondary/10 animate-pulse" />
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground p-4">
                <Camera className="h-8 w-8 text-muted-foreground/50" />
                <p>Cámara no activa o sin permiso.</p>
                <p>Ingresa el código SKU manualmente abajo.</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1">
              <Label htmlFor="sku-input" className="text-xs">
                Código SKU / Barras
              </Label>
              <Input
                id="sku-input"
                placeholder="Ej. 100012"
                value={skuDetectado}
                onChange={(e) => setSkuDetectado(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cantidad-input" className="text-xs">
                Cantidad
              </Label>
              <Input
                id="cantidad-input"
                type="number"
                min="0.1"
                step="any"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onCerrar}>
              <X className="h-4 w-4" /> Cancelar
            </Button>
            <Button onClick={handleConfirmar} disabled={!skuDetectado.trim()}>
              <Check className="h-4 w-4" /> Registrar Conteo
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
