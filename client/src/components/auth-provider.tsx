"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { clearSession, getUsuario, setSession } from "@/lib/auth-storage";
import type { AuthenticatedUsuario } from "@/lib/types";

interface AuthContextValue {
  usuario: AuthenticatedUsuario | null;
  cargando: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const RUTAS_PUBLICAS = new Set(["/login"]);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<AuthenticatedUsuario | null>(null);
  const [cargando, setCargando] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Lee la sesión persistida (si hay) una sola vez al montar.
  useEffect(() => {
    setUsuario(getUsuario());
    setCargando(false);
  }, []);

  // Guarda la ruta: sin sesión -> /login; con sesión, no tiene sentido
  // quedarse en /login (redirige a la app).
  useEffect(() => {
    if (cargando) return;
    const esPublica = RUTAS_PUBLICAS.has(pathname);
    if (!usuario && !esPublica) {
      router.replace("/login");
    } else if (usuario && esPublica) {
      router.replace("/");
    }
  }, [usuario, cargando, pathname, router]);

  const login = useCallback(async (email: string, password: string) => {
    const resultado = await api.login(email, password);
    setSession(resultado.accessToken, resultado.usuario);
    setUsuario(resultado.usuario);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUsuario(null);
    router.replace("/login");
  }, [router]);

  const esPublica = RUTAS_PUBLICAS.has(pathname);
  // Mientras se resuelve la sesión, o justo antes de que el efecto de
  // arriba redirija, no se muestra ni el contenido protegido ni el login
  // equivocado: evita un parpadeo de una pantalla a la que no se debería
  // tener acceso todavía.
  const listoParaMostrar = !cargando && (esPublica ? !usuario : Boolean(usuario));

  return (
    <AuthContext.Provider value={{ usuario, cargando, login, logout }}>
      {listoParaMostrar ? (
        children
      ) : (
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
