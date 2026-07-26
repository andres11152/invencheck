import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { InventarioDetalle, ProcesarTomaPorVozResult } from "@/lib/types";

// A diferencia de inventario-page-content.test.tsx, este archivo NO mockea
// @/hooks/use-offline-sync — necesita el hook REAL para poder reproducir
// el bug (el toggle de demo "Simular Pérdida de Señal" no interceptaba el
// dictado). Solo se mockea su dependencia de IndexedDB, igual que hace
// use-offline-sync.test.ts.
vi.mock("@/lib/offline-queue", () => ({
  listarPendientes: vi.fn().mockResolvedValue([]),
  encolarDictado: vi.fn().mockResolvedValue(1),
  eliminarPendiente: vi.fn(),
  registrarIntentoFallido: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, getInventario: vi.fn(), procesarVoz: vi.fn() },
  };
});

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    usuario: { id: "u1", email: "operario@invencheck.demo", nombre: "Operario", rol: "OPERARIO" },
    cargando: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock("@/components/print-acta", () => ({ PrintActa: () => null }));

import { api } from "@/lib/api";
import { encolarDictado } from "@/lib/offline-queue";
import { InventarioPageContent } from "./inventario-page-content";

function inventarioBase(): InventarioDetalle {
  return {
    id: "inv-1",
    almacenId: "alm-1",
    usuarioId: "u1",
    auditorId: null,
    auditaAId: null,
    estado: "BORRADOR" as InventarioDetalle["estado"],
    fechaCorte: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    almacen: { id: "alm-1", codigo: "BOD-1", nombre: "Bodega Principal", unidad: "Piscilago", createdAt: "", updatedAt: "" },
    items: [],
    alertas: [],
    auditaA: null,
    auditoriaCiega: null,
  };
}

/**
 * Regresión de un bug real encontrado en auditoría (no reportado por un
 * usuario): el botón de demo "Simular Pérdida de Señal" cambiaba el badge
 * a "Modo Bodega Sótano (Simulado)", pero `handleProcesar` nunca revisaba
 * ese estado antes de llamar a `api.procesarVoz` — si la red real seguía
 * viva (el caso normal de un toggle simulado, sin apagar el wifi de
 * verdad), el dictado se procesaba contra el servidor real en vez de
 * encolarse en IndexedDB, contradiciendo lo que la pantalla decía. Se
 * confirmó empíricamente antes de corregir: con el toggle activo,
 * `procesarVoz` se llamaba igual y `encolarDictado` nunca se invocaba.
 */
describe("InventarioPageContent — el toggle de demo 'Simular Pérdida de Señal' realmente encola el dictado", () => {
  beforeEach(() => {
    vi.mocked(encolarDictado).mockClear();
    vi.mocked(api.procesarVoz).mockClear();
  });
  afterEach(() => cleanup());

  it('dictar con el toggle activo encola en IndexedDB y NO llama a procesarVoz, aunque la red real siga disponible', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getInventario).mockResolvedValue(inventarioBase());
    // La red real sigue perfectamente disponible — si el bug existiera,
    // esta llamada resolvería sin problema y el dictado NUNCA se encolaría.
    vi.mocked(api.procesarVoz).mockResolvedValue({
      inventario: inventarioBase(),
      fuenteIA: "REGLAS_LOCALES",
      itemsMatcheados: [],
      itemsNoMatcheados: [],
    } satisfies ProcesarTomaPorVozResult);

    render(<InventarioPageContent params={{ id: "inv-1" }} />);
    await waitFor(() => expect(api.getInventario).toHaveBeenCalled());

    const botonSimular = await screen.findByRole("button", {
      name: /simular pérdida de señal/i,
    });
    await user.click(botonSimular);
    await screen.findByText(/modo bodega sótano \(simulado\)/i);

    await user.type(
      screen.getByLabelText(/texto \(dictado o manual/i),
      "quince kilos de papa criolla",
    );
    await user.click(screen.getByRole("button", { name: /procesar dictado/i }));

    await waitFor(() => {
      expect(encolarDictado).toHaveBeenCalledWith("inv-1", "quince kilos de papa criolla");
    });
    expect(api.procesarVoz).not.toHaveBeenCalled();
  });

  it('al restablecer la conexión (desactivar el toggle), sincroniza lo que quedó encolado durante el modo simulado', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getInventario).mockResolvedValue(inventarioBase());
    vi.mocked(api.procesarVoz).mockResolvedValue({
      inventario: inventarioBase(),
      fuenteIA: "REGLAS_LOCALES",
      itemsMatcheados: [],
      itemsNoMatcheados: [],
    } satisfies ProcesarTomaPorVozResult);

    // `listarPendientes`/`encolarDictado` mockeados con un estado compartido
    // en memoria — así el pendiente que se guarda durante el modo simulado
    // aparece de verdad al listar después, sin depender de IndexedDB real.
    const { listarPendientes } = await import("@/lib/offline-queue");
    let pendienteGuardado: { id: number; inventarioId: string; texto: string; creadoEn: string; intentos: number } | null = null;
    vi.mocked(listarPendientes).mockImplementation(async () =>
      pendienteGuardado ? [pendienteGuardado] : [],
    );
    vi.mocked(encolarDictado).mockImplementation(async (inventarioId, texto) => {
      pendienteGuardado = { id: 1, inventarioId, texto, creadoEn: new Date().toISOString(), intentos: 0 };
      return 1;
    });

    render(<InventarioPageContent params={{ id: "inv-1" }} />);
    await waitFor(() => expect(api.getInventario).toHaveBeenCalled());

    // Activa el modo simulado ANTES de dictar, para que el dictado se
    // encole (ver el primer test de este archivo) en vez de ir al server.
    const botonSimular = await screen.findByRole("button", {
      name: /simular pérdida de señal/i,
    });
    await user.click(botonSimular);
    await user.type(
      screen.getByLabelText(/texto \(dictado o manual/i),
      "quince kilos de papa criolla",
    );
    await user.click(screen.getByRole("button", { name: /procesar dictado/i }));
    await waitFor(() => expect(encolarDictado).toHaveBeenCalled());
    expect(api.procesarVoz).not.toHaveBeenCalled();

    // Restablece la conexión: el pendiente encolado debe sincronizarse solo.
    const botonRestablecer = await screen.findByRole("button", {
      name: /restablecer conexión/i,
    });
    await user.click(botonRestablecer);

    await waitFor(() => {
      expect(api.procesarVoz).toHaveBeenCalledWith(
        "inv-1",
        "quince kilos de papa criolla",
      );
    });
  });
});
