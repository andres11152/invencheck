"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Mic, MicOff, Send } from "lucide-react";

import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { BarcodeScannerModal } from "@/components/barcode-scanner-modal";

export function VoiceCapture({
  onProcesar,
  onEscanearSku,
  procesando,
  autoFocusTexto = false,
  fuenteIA = null,
}: {
  onProcesar: (texto: string) => void;
  onEscanearSku: (sku: string, cantidad: number) => void;
  procesando: boolean;
  autoFocusTexto?: boolean;
  fuenteIA?: "GEMINI" | "REGLAS_LOCALES" | "ESCANER_SKU" | "SELECCION_MANUAL" | null;
}) {
  const { isSupported, estado, transcript, interim, start, stop, reset } =
    useSpeechRecognition("es-CO");
  const [texto, setTexto] = useState("");
  const [escanerAbierto, setEscanerAbierto] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (transcript) setTexto(transcript);
  }, [transcript]);

  useEffect(() => {
    if (autoFocusTexto) textareaRef.current?.focus();
  }, [autoFocusTexto]);

  const escuchando = estado === "escuchando";

  function handleMicClick() {
    if (escuchando) {
      stop();
      return;
    }
    reset();
    setTexto("");
    start();
  }

  function handleProcesar() {
    const valor = texto.trim();
    if (!valor || procesando) return;
    onProcesar(valor);
    setTexto("");
    reset();
  }

  const estadoLabel = procesando
    ? "Procesando IA..."
    : escuchando
      ? "Escuchando..."
      : "Listo para dictar";

  return (
    <Card className="border-primary/20 bg-card/70 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_10px_40px_-16px_hsl(var(--primary)/0.35)]">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0 pb-4 border-b border-border/40">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">Dictado por Voz</CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEscanerAbierto(true)}
              className="h-7 px-2.5 text-xs gap-1 border-primary/30 hover:bg-primary/10 text-primary"
            >
              <Camera className="h-3.5 w-3.5" /> Escáner SKU
            </Button>
          </div>
          <CardDescription>
            Ej: &quot;quince kilos de papa criolla y noventa kilos de cebolla&quot;
          </CardDescription>
        </div>
        <div className="flex sm:justify-end">
          {/* Badges de estado IA usando tokens de marca InvenCheck */}
          {fuenteIA === "GEMINI" && (
            <div className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary shadow-sm backdrop-blur-sm animate-in fade-in-0 zoom-in-95 duration-300">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
              </span>
              IA Gemini Activa
            </div>
          )}
          {fuenteIA === "REGLAS_LOCALES" && (
            <div className="flex items-center gap-1.5 rounded-full border border-secondary/40 bg-secondary/10 px-3.5 py-1 text-xs font-semibold text-secondary backdrop-blur-sm animate-in fade-in-0 zoom-in-95 duration-300">
              <span className="h-2 w-2 rounded-full bg-secondary" />
              Modo sin IA · Reglas Locales
            </div>
          )}
          {fuenteIA === "ESCANER_SKU" && (
            <div className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary backdrop-blur-sm animate-in fade-in-0 zoom-in-95 duration-300">
              <span className="h-2 w-2 rounded-full bg-primary" />
              Match por SKU exacto
            </div>
          )}
          {fuenteIA === "SELECCION_MANUAL" && (
            <div className="flex items-center gap-1.5 rounded-full border border-secondary/40 bg-secondary/10 px-3.5 py-1 text-xs font-semibold text-secondary backdrop-blur-sm animate-in fade-in-0 zoom-in-95 duration-300">
              <span className="h-2 w-2 rounded-full bg-secondary" />
              Elegido manualmente
            </div>
          )}
          {fuenteIA === null && (
            <div className="flex items-center gap-1.5 rounded-full border border-muted bg-muted/20 px-3.5 py-1 text-xs font-medium text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
              En Espera
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <div className="relative flex flex-col items-center justify-center my-2">
          {/* Resplandor ambiental de fondo (Ambient Glow) */}
          <div
            className={cn(
              "absolute inset-0 rounded-full blur-2xl transition-all duration-500",
              escuchando
                ? "bg-destructive/35 scale-125"
                : "bg-primary/20 scale-100 opacity-60",
            )}
          />

          <button
            type="button"
            onClick={handleMicClick}
            disabled={!isSupported || procesando}
            aria-label={escuchando ? "Detener dictado" : "Iniciar dictado"}
            className={cn(
              "relative z-10 flex h-24 w-24 items-center justify-center rounded-full text-primary-foreground shadow-xl transition-all duration-300 hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100",
              escuchando
                ? "bg-destructive shadow-[0_0_35px_rgba(239,68,68,0.6)] animate-pulse"
                : "bg-primary shadow-primary/40 hover:bg-primary/90 hover:shadow-[0_0_30px_rgba(0,103,177,0.5)]",
            )}
          >
            {procesando ? (
              <Loader2 className="h-9 w-9 animate-spin" />
            ) : escuchando ? (
              <MicOff className="h-9 w-9" />
            ) : (
              <Mic className="h-9 w-9" />
            )}
          </button>
        </div>

        {/* Ecualizador Gráfico de Ondas de Sonido (Audio Waveform Visualizer) */}
        {escuchando && (
          <div className="flex items-center justify-center gap-1.5 h-8 my-1 animate-in fade-in-0 duration-300">
            {[0.1, 0.4, 0.2, 0.6, 0.3, 0.5, 0.15].map((delay, idx) => (
              <span
                key={idx}
                className="w-1.5 rounded-full bg-secondary shadow-[0_0_8px_hsl(var(--secondary))]"
                style={{
                  animation: `audio-wave 0.8s ease-in-out infinite alternate`,
                  animationDelay: `${delay}s`,
                }}
              />
            ))}
          </div>
        )}

        <p
          className={cn(
            "text-sm font-medium transition-colors",
            escuchando && "text-destructive font-semibold",
            procesando && "text-secondary font-semibold",   /* Amarillo InvenCheck mientras procesa */
          )}
        >
          {estadoLabel}
        </p>

        {!isSupported && (
          <p className="text-center text-xs text-warning">
            Tu navegador no soporta dictado de voz (usa Chrome/Edge). Escribe manualmente abajo.
          </p>
        )}

        <div className="w-full space-y-1.5">
          <Label htmlFor="texto-dictado">Texto (dictado o manual — edítalo si hace falta)</Label>
          <Textarea
            id="texto-dictado"
            ref={textareaRef}
            value={interim ? `${texto} ${interim}`.trim() : texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="quince kilos de papa criolla..."
            rows={3}
          />
        </div>

        <Button
          size="lg"
          className="w-full"
          onClick={handleProcesar}
          disabled={!texto.trim() || procesando}
        >
          {procesando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          Procesar Dictado
        </Button>
      </CardContent>

      <BarcodeScannerModal
        abierto={escanerAbierto}
        onCerrar={() => setEscanerAbierto(false)}
        onEscanear={onEscanearSku}
      />
    </Card>
  );
}
