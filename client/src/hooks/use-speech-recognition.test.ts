import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useSpeechRecognition } from "./use-speech-recognition";

interface FakeResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface FakeEvent {
  resultIndex: number;
  results: FakeResult[];
}

/** Doble mínimo de SpeechRecognition: expone los handlers asignados para dispararlos a mano desde el test. */
function crearFakeRecognitionCtor() {
  const instancia = {
    lang: "",
    continuous: false,
    interimResults: false,
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn(),
    onresult: null as ((event: FakeEvent) => void) | null,
    onerror: null as (() => void) | null,
    onend: null as (() => void) | null,
  };
  // Función regular, no arrow: una arrow function no es "constructible" y
  // `new Ctor()` fallaría con "is not a constructor".
  const Ctor = vi.fn(function FakeSpeechRecognition() {
    return instancia;
  });
  return { Ctor, instancia };
}

function finalResult(transcript: string): FakeResult {
  return { isFinal: true, 0: { transcript } };
}

describe("useSpeechRecognition", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("no duplica un resultado final que el motor reenvía en un evento posterior (bug de Android)", () => {
    const { Ctor, instancia } = crearFakeRecognitionCtor();
    vi.stubGlobal("SpeechRecognition", Ctor);

    const { result } = renderHook(() => useSpeechRecognition());

    act(() => {
      result.current.start();
    });

    // Primer evento: un resultado final.
    act(() => {
      instancia.onresult?.({
        resultIndex: 0,
        results: [finalResult("ochenta kilos de maiz")],
      });
    });
    expect(result.current.transcript).toBe("ochenta kilos de maiz");

    // Android reenvía el MISMO resultado final otra vez (mismo índice) — no
    // debe duplicarse en el transcript acumulado.
    act(() => {
      instancia.onresult?.({
        resultIndex: 0,
        results: [finalResult("ochenta kilos de maiz")],
      });
    });
    expect(result.current.transcript).toBe("ochenta kilos de maiz");

    // Llega un resultado final genuinamente nuevo, agregado al array — sí debe sumarse.
    act(() => {
      instancia.onresult?.({
        resultIndex: 0,
        results: [finalResult("ochenta kilos de maiz"), finalResult(" y sal")],
      });
    });
    expect(result.current.transcript).toBe("ochenta kilos de maiz y sal");
  });

  it("limpia repeticiones incluso si llegan dentro del mismo resultado final", () => {
    const { Ctor, instancia } = crearFakeRecognitionCtor();
    vi.stubGlobal("SpeechRecognition", Ctor);

    const { result } = renderHook(() => useSpeechRecognition());

    act(() => {
      result.current.start();
    });

    act(() => {
      instancia.onresult?.({
        resultIndex: 0,
        results: [finalResult("80 80 80 kg de maiz")],
      });
    });

    expect(result.current.transcript).toBe("80 kg de maiz");
  });

  it("reset() reinicia el conteo de finales, así el próximo dictado no arrastra el anterior", () => {
    const { Ctor, instancia } = crearFakeRecognitionCtor();
    vi.stubGlobal("SpeechRecognition", Ctor);

    const { result } = renderHook(() => useSpeechRecognition());

    act(() => {
      result.current.start();
    });
    act(() => {
      instancia.onresult?.({ resultIndex: 0, results: [finalResult("cinco kilos")] });
    });
    expect(result.current.transcript).toBe("cinco kilos");

    act(() => {
      result.current.reset();
    });
    expect(result.current.transcript).toBe("");

    // Nueva sesión de dictado: el motor puede volver a mandar índice 0 —
    // como el contador se reinició en reset(), esto debe contar como nuevo.
    act(() => {
      instancia.onresult?.({ resultIndex: 0, results: [finalResult("diez kilos")] });
    });
    expect(result.current.transcript).toBe("diez kilos");
  });
});
