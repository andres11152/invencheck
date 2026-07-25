import type { AuthenticatedUsuario } from "./types";

const TOKEN_KEY = "invencheck.token";
const USUARIO_KEY = "invencheck.usuario";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getUsuario(): AuthenticatedUsuario | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USUARIO_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthenticatedUsuario;
  } catch {
    return null;
  }
}

export function setSession(token: string, usuario: AuthenticatedUsuario): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USUARIO_KEY, JSON.stringify(usuario));
}

export function clearSession(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USUARIO_KEY);
}
