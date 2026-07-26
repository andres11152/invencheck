import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { BarcodeScannerModal } from "./barcode-scanner-modal";

/**
 * Regresión de un bug real reportado en producción: la cámara pedía permiso
 * y se activaba, pero el feed nunca se veía. Causa: `videoRef.current.srcObject
 * = stream` se asignaba ANTES de que React montara el <video> (que solo
 * existe en el DOM una vez `camaraActiva` es true) — la asignación caía en
 * un `if (videoRef.current)` que nunca era cierto en ese momento, y el
 * `<video>` recién montado después nunca recibía el stream.
 */
describe("BarcodeScannerModal — cámara", () => {
  const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
  let getUserMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getUserMedia = vi.fn().mockResolvedValue(stream);
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia },
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("conecta el stream obtenido al elemento <video> una vez montado", async () => {
    render(<BarcodeScannerModal abierto={true} onCerrar={vi.fn()} onEscanear={vi.fn()} />);

    await waitFor(() => {
      expect(getUserMedia).toHaveBeenCalledWith({
        video: { facingMode: "environment" },
      });
    });

    // Dialog (Radix) portala el contenido a document.body, no queda dentro
    // del `container` local de render() — hay que buscar en todo el documento.
    await waitFor(() => {
      const video = document.querySelector("video");
      expect(video).not.toBeNull();
      expect(video?.srcObject).toBe(stream);
    });
  });

  it("si getUserMedia falla, no muestra <video> y deja la entrada manual", async () => {
    getUserMedia.mockRejectedValue(new Error("Permission denied"));

    render(<BarcodeScannerModal abierto={true} onCerrar={vi.fn()} onEscanear={vi.fn()} />);

    await waitFor(() => {
      expect(getUserMedia).toHaveBeenCalled();
    });

    expect(document.querySelector("video")).toBeNull();
  });
});
