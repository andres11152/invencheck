const STORAGE_KEY = "invencheck.usuarioId";

/**
 * Identidad de operador local (sin login): persiste un id generado en el
 * dispositivo para que las tomas físicas queden asociadas a un mismo
 * usuarioId entre sesiones, sin backend de autenticación.
 */
export function getUsuarioIdLocal(): string {
  if (typeof window === "undefined") return "operario-server";

  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;

  const generated = `operario-${crypto.randomUUID().slice(0, 8)}`;
  window.localStorage.setItem(STORAGE_KEY, generated);
  return generated;
}
