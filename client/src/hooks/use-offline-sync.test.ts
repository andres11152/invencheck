import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import { useOfflineSync } from "./use-offline-sync";
import type { DictadoPendiente } from "@/lib/offline-queue";

vi.mock("@/lib/offline-queue", () => ({
  listarPendientes: vi.fn(),
  encolarDictado: vi.fn(),
  eliminarPendiente: vi.fn(),
  registrarIntentoFallido: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, procesarVoz: vi.fn() } };
});

import { listarPendientes, eliminarPendiente } from "@/lib/offline-queue";
import { api } from "@/lib/api";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    value,
    configurable: true,
    writable: true,
  });
}

function pendiente(overrides: Partial<DictadoPendiente> = {}): DictadoPendiente {
  return {
    id: 1,
    inventarioId: "inv-1",
    texto: "cinco kilos de papa criolla",
    creadoEn: new Date().toISOString(),
    intentos: 0,
    ...overrides,
  };
}

describe("useOfflineSync", () => {
  beforeEach(() => {
    setOnline(true);
    vi.mocked(listarPendientes).mockReset().mockResolvedValue([]);
    vi.mocked(eliminarPendiente).mockReset();
    vi.mocked(api.procesarVoz).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("reintenta automáticamente un pendiente con intentos === 0", async () => {
    const item = pendiente({ intentos: 0 });
    vi.mocked(listarPendientes).mockResolvedValue([item]);
    vi.mocked(api.procesarVoz).mockResolvedValue({} as never);

    renderHook(() => useOfflineSync("inv-1", vi.fn()));

    await waitFor(() => {
      expect(api.procesarVoz).toHaveBeenCalledWith(item.inventarioId, item.texto);
    });
    expect(eliminarPendiente).toHaveBeenCalledWith(item.id);
  });

  it("no reintenta un pendiente con intentos > 0 salvo que se pida incluirFallidos", async () => {
    const item = pendiente({ intentos: 2 });
    vi.mocked(listarPendientes).mockResolvedValue([item]);

    const { result } = renderHook(() => useOfflineSync("inv-1", vi.fn()));

    await waitFor(() => {
      expect(listarPendientes).toHaveBeenCalled();
    });
    expect(api.procesarVoz).not.toHaveBeenCalled();

    vi.mocked(api.procesarVoz).mockResolvedValue({} as never);
    await act(async () => {
      await result.current.sincronizar({ incluirFallidos: true });
    });

    expect(api.procesarVoz).toHaveBeenCalledWith(item.inventarioId, item.texto);
  });

  it("volver a estar online dispara un intento de sync inmediato (sin esperar el poll)", async () => {
    setOnline(false);
    const item = pendiente({ intentos: 0 });
    vi.mocked(listarPendientes).mockResolvedValue([item]);
    vi.mocked(api.procesarVoz).mockResolvedValue({} as never);

    renderHook(() => useOfflineSync("inv-1", vi.fn()));

    await Promise.resolve();
    expect(api.procesarVoz).not.toHaveBeenCalled();

    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => {
      expect(api.procesarVoz).toHaveBeenCalledWith(item.inventarioId, item.texto);
    });
  });
});
