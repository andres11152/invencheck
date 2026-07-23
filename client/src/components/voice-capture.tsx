"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff, Send } from "lucide-react";

import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function VoiceCapture({
  onProcesar,
  procesando,
  autoFocusTexto = false,
  fuenteIA = null,
}: {
  onProcesar: (texto: string) => void;
  procesando: boolean;
  autoFocusTexto?: boolean;
  fuenteIA?: "OPENAI" | "GEMINI" | "REGLAS_LOCALES" | null;
}) {
  const { isSupported, estado, transcript, interim, start, stop, reset } =
    useSpeechRecognition("es-CO");
  const [texto, setTexto] = useState("");
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
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0 pb-4 border-b border-border/40">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">Dictado por Voz</CardTitle>
          <CardDescription>
            Ej: &quot;quince kilos de papa criolla y noventa kilos de cebolla&quot;
          </CardDescription>
        </div>
        <div className="flex sm:justify-end">
          {fuenteIA === "GEMINI" && (
            <div className="flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-3.5 py-1 text-xs font-semibold text-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.2)]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              Gemini 3.5 Active
            </div>
          )}
          {fuenteIA === "OPENAI" && (
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-semibold text-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.2)]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              OpenAI Active
            </div>
          )}
          {fuenteIA === "REGLAS_LOCALES" && (
            <div className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1 text-xs font-semibold text-amber-500">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Offline Rules (No AI)
            </div>
          )}
          {fuenteIA === null && (
            <div className="flex items-center gap-1.5 rounded-full border border-muted bg-muted/20 px-3.5 py-1 text-xs font-medium text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
              AI Parser Standby
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={handleMicClick}
          disabled={!isSupported || procesando}
          aria-label={escuchando ? "Detener dictado" : "Iniciar dictado"}
          className={cn(
            "flex h-24 w-24 items-center justify-center rounded-full text-primary-foreground shadow-lg transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40",
            escuchando ? "bg-destructive animate-pulse-ring" : "bg-primary hover:bg-primary/90",
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

        <p
          className={cn(
            "text-sm font-medium",
            escuchando && "text-destructive",
            procesando && "text-primary",
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
    </Card>
  );
}
