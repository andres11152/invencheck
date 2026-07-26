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

      // Se recorre el array completo (no desde `event.resultIndex`) porque
      // ese índice no es confiable en Android; en cambio, cada resultado
      // final se compara contra `finalesContadosRef` para no sumarlo dos
      // veces si el motor lo reenvía.
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          if (i >= finalesContadosRef.current) {
            nuevoFinal += result[0].transcript;
          }
        } else {
          // Solo interesa el interim más reciente para la vista previa en
          // vivo — no se acumulan varios interim entre sí.
          interimChunk = result[0].transcript;
        }
      }

      finalesContadosRef.current = Math.max(
        finalesContadosRef.current,
        event.results.length,
      );

      if (nuevoFinal) {
        setTranscript((prev) => limpiarRepeticiones(`${prev} ${nuevoFinal}`.trim()));
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
