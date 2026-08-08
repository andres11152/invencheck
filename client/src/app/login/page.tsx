"use client";

// Ver nota en app/page.tsx: necesario para que "Collect page data" de
// `next build` no falle con `TypeError: n.createContext is not a function`.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { AlertTriangle, Eye, EyeOff, Loader2, LogIn, Mic, RefreshCw } from "lucide-react";
import { InvenCheckLogo } from "@/components/invencheck-logo";
import { toast } from "sonner";

import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClientProviders } from "@/components/client-providers";

const LOCAL_STORAGE_KEY = "invencheck_remember_email";

function LoginPageContent() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [recordar, setRecordar] = useState(false);
  const [entrando, setEntrando] = useState(false);

  // Cargar correo guardado al montar
  useEffect(() => {
    const savedEmail = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedEmail) {
      setEmail(savedEmail);
      setRecordar(true);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEntrando(true);
    try {
      if (recordar) {
        localStorage.setItem(LOCAL_STORAGE_KEY, email);
      } else {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
      await login(email, password);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo iniciar sesión");
    } finally {
      setEntrando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-[#021123] via-[#091f3a] to-[#041225]">
      <Card className="w-full max-w-sm animate-in fade-in-50 zoom-in-[0.98] duration-700 ease-out overflow-hidden bg-card/40 border-border/50 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-2xl backdrop-saturate-150 sm:max-w-3xl sm:grid sm:grid-cols-2">
        {/* ── Panel de marca InvenCheck — animado de entrada ── */}
        <div className="bg-brand-gradient hidden flex-col justify-between p-10 sm:flex animate-in slide-in-from-left-8 fade-in duration-1000 ease-out">
          {/* Logo horizontal InvenCheck blanco — con efecto de brillo reflectivo */}
          <div className="hover:scale-[1.02] hover:drop-shadow-[0_0_15px_rgba(255,255,255,0.5)] transition-all duration-500 origin-left cursor-pointer">
            <InvenCheckLogo variant="blanco" size="md" priority />
          </div>

          {/* Tagline central */}
          <div className="space-y-4">
            <h2 className="text-3.5xl font-bold leading-tight text-white tracking-tight animate-in fade-in slide-in-from-bottom-4 delay-200 duration-1000">
              Toma física
              <br />
              <span className="text-secondary drop-shadow-[0_2px_10px_rgba(255,208,0,0.2)]">sin errores</span>
            </h2>
            <p className="text-sm text-white/70 animate-in fade-in slide-in-from-bottom-4 delay-300 duration-1000">
              Captura por voz para bodegas y almacenes.
              Procesado con IA en segundos.
            </p>
          </div>

          {/* Beneficios - Con efectos de hover dinámicos y rotaciones según el icono */}
          <ul className="space-y-4 animate-in fade-in slide-in-from-bottom-4 delay-500 duration-1000">
            <li className="group flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-secondary border border-white/5 backdrop-blur-sm group-hover:scale-110 group-hover:bg-white/20 group-hover:rotate-12 transition-all duration-300">
                <Mic className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-white/90 group-hover:text-white group-hover:translate-x-1 transition-all duration-300">
                Dictado inteligente por voz
              </p>
            </li>
            <li className="group flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-secondary border border-white/5 backdrop-blur-sm group-hover:scale-110 group-hover:bg-white/20 group-hover:animate-pulse transition-all duration-300">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-white/90 group-hover:text-white group-hover:translate-x-1 transition-all duration-300">
                Detección de anomalías en tiempo real
              </p>
            </li>
            <li className="group flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-secondary border border-white/5 backdrop-blur-sm group-hover:scale-110 group-hover:bg-white/20 group-hover:rotate-180 transition-all duration-500">
                <RefreshCw className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-white/90 group-hover:text-white group-hover:translate-x-1 transition-all duration-300">
                Sincronización directa con catálogo
              </p>
            </li>
          </ul>
        </div>


        {/* Panel de Login */}
        <div className="p-6 sm:p-10 flex flex-col justify-center animate-in slide-in-from-right-8 fade-in duration-1000 ease-out">
          <CardHeader className="items-center p-0 text-center">
            {/* Logo InvenCheck — visible en móvil y con efecto respiración pulsante */}
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white p-3 shadow-lg hover:scale-105 hover:shadow-[#FFD000]/10 hover:shadow-2xl transition-all duration-500 animate-pulse-ring sm:hidden">
              <InvenCheckLogo variant="color" size="md" priority />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">
              Inven<span className="text-secondary animate-pulse">Check</span>
            </CardTitle>
            <p className="mt-1 text-xs font-medium text-muted-foreground">
              Gestión de Inventario · Bodegas
            </p>
          </CardHeader>

          <CardContent className="p-0 pt-5">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="space-y-1.5 group">
                <Label htmlFor="email" className="group-focus-within:text-secondary transition-colors duration-200">Correo</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-muted/40 border-border/70 hover:border-border focus:border-secondary focus:ring-secondary/20 transition-all duration-200"
                />
              </div>
              <div className="space-y-1.5 group">
                <Label htmlFor="password" className="group-focus-within:text-secondary transition-colors duration-200">Contraseña</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10 bg-muted/40 border-border/70 hover:border-border focus:border-secondary focus:ring-secondary/20 transition-all duration-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground active:scale-90 transition-all duration-200 focus:outline-none"
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Checkbox "Recordar correo electrónico" */}
              <div className="flex items-center space-x-2 py-1 select-none">
                <input
                  type="checkbox"
                  id="recordar"
                  checked={recordar}
                  onChange={(e) => setRecordar(e.target.checked)}
                  className="h-4 w-4 rounded border-border bg-muted/40 text-primary focus:ring-secondary/30 focus:ring-offset-background transition-all duration-200 cursor-pointer"
                />
                <Label
                  htmlFor="recordar"
                  className="text-sm font-medium leading-none cursor-pointer text-muted-foreground hover:text-foreground transition-colors duration-200"
                >
                  Recordar mi correo
                </Label>
              </div>

              <Button 
                type="submit" 
                size="lg" 
                disabled={entrando} 
                className="mt-1 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-primary/20 hover:shadow-primary/30 group"
              >
                {entrando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="h-4 w-4 group-hover:translate-x-1 transition-transform duration-300" />
                )}
                Entrar
              </Button>
            </form>
          </CardContent>
        </div>
      </Card>
    </main>
  );
}

export default function LoginPage() {
  return (
    <ClientProviders>
      <LoginPageContent />
    </ClientProviders>
  );
}
