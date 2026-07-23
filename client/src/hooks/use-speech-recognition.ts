"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let finalChunk = "";
      let interimChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalChunk += result[0].transcript;
        else interimChunk += result[0].transcript;
      }
      if (finalChunk) setTranscript((prev) => `${prev} ${finalChunk}`.trim());
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
