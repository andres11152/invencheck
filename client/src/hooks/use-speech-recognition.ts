"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { limpiarRepeticiones } from "@/lib/voice-sanitize";

// El DOM lib de TS no incluye la Web Speech API (aún no estandarizada).
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export type EstadoVoz = "inactivo" | "escuchando" | "error";

/**
 * Combina un fragmento final nuevo con el texto final ya acumulado.
 * En Android, un `isFinal` nuevo no siempre es la palabra/frase nueva
 * sola — a veces el motor reenvía la frase COMPLETA dicha hasta ese
 * momento como si fuera un resultado nuevo (con una pausa natural antes
 * de "y" o entre números). Sumar esos fragmentos con `+=` a ciegas produce
 * duplicación en cascada ("15 kilos de papa y 15 kilos de papa y 90...").
 * Si el fragmento nuevo ya empieza con lo acumulado, es un reenvío
 * ampliado: reemplaza en vez de concatenar. Si lo acumulado ya empieza con
 * el fragmento nuevo, el fragmento no aporta nada nuevo: se ignora.
 */
function combinarFinal(acumulado: string, nuevo: string): string {
  const limpio = nuevo.trim();
  if (!limpio) return acumulado;
  if (!acumulado) return limpio;
  if (limpio.startsWith(acumulado)) return limpio;
  if (acumulado.startsWith(limpio)) return acumulado;
  return `${acumulado} ${limpio}`;
}

export function useSpeechRecognition(lang = "es-CO") {
  const [isSupported, setIsSupported] = useState(false);
  const [estado, setEstado] = useState<EstadoVoz>("inactivo");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Cuántos `event.results[i]` ya se contabilizaron como finales. En
  // Android, `event.resultIndex` no es confiable en modo `continuous`: el
  // motor a veces reenvía en un `onresult` posterior resultados que ya
  // habían llegado marcados `isFinal` en un evento anterior, con un
  // `resultIndex` que no refleja eso. Confiar solo en el índice (como hacía
  // antes este hook) duplicaba esos resultados en `transcript` cada vez que
  // se reenviaban — de ahí bugs tipo "80 80 80 kg de maíz" en mobile. Llevar
  // la cuenta de cuántos finales ya se sumaron evita volver a sumarlos sin
  // importar qué diga `resultIndex`.
  const finalesContadosRef = useRef(0);

  useEffect(() => {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setIsSupported(Boolean(Ctor));
  }, []);

  const start = useCallback(() => {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      setEstado("error");
      return;
    }

    finalesContadosRef.current = 0;

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let nuevoFinal = "";
      let interimChunk = "";
      // Cuenta SOLO los resultados marcados `isFinal` dentro de este mismo
      // evento (en orden), no la longitud cruda del array — un resultado
      // que todavía es interim también ocupa una posición en
      // `event.results`, así que compararse contra `event.results.length`
      // hacía que, al pasar ese mismo resultado de interim a final en un
      // evento posterior, se descartara por "ya contado" sin haberlo sumado
      // nunca — de ahí que se perdiera texto dictado (ej. un número que
      // tarda un evento extra en finalizarse mientras ya llegó interim la
      // palabra siguiente).
      let finalesEnEsteEvento = 0;

      // Se recorre el array completo (no desde `event.resultIndex`) porque
      // ese índice no es confiable en Android; en cambio, cada resultado
      // final se compara contra `finalesContadosRef` para no sumarlo dos
      // veces si el motor lo reenvía.
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalesEnEsteEvento++;
          if (finalesEnEsteEvento > finalesContadosRef.current) {
            nuevoFinal = combinarFinal(nuevoFinal, result[0].transcript);
          }
        } else {
          // Solo interesa el interim más reciente para la vista previa en
          // vivo — no se acumulan varios interim entre sí.
          interimChunk = result[0].transcript;
        }
      }

      finalesContadosRef.current = Math.max(
        finalesContadosRef.current,
        finalesEnEsteEvento,
      );

      if (nuevoFinal) {
        setTranscript((prev) => limpiarRepeticiones(combinarFinal(prev, nuevoFinal)));
      }
      setInterim(interimChunk);
    };

    recognition.onerror = () => setEstado("error");
    recognition.onend = () => setEstado("inactivo");

    recognitionRef.current = recognition;
    recognition.start();
    setEstado("escuchando");
  }, [lang]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setEstado("inactivo");
  }, []);

  const reset = useCallback(() => {
    finalesContadosRef.current = 0;
    setTranscript("");
    setInterim("");
  }, []);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  return {
    isSupported,
    estado,
    transcript,
    interim,
    start,
    stop,
    reset,
    setTranscript,
  };
}
