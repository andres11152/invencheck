"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientProviders } from "@/components/client-providers";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Captura de excepción no controlada en el cliente para telemetría o reporte.
  useEffect(() => {
    // Registro de error disponible para integración con servicios de monitoreo de cliente
  }, [error]);

  return (
    <ClientProviders>
      <main className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm animate-in fade-in-0 zoom-in-95 duration-500 backdrop-blur-2xl">
          <CardHeader className="items-center text-center">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <CardTitle>Algo salió mal</CardTitle>
            <p className="text-sm text-muted-foreground">
              Tuvimos un problema al mostrar esta pantalla. Tu conteo guardado no se pierde —
              intenta de nuevo.
            </p>
          </CardHeader>
          <CardContent>
            <Button size="lg" className="w-full" onClick={reset}>
              <RotateCw className="h-4 w-4" />
              Reintentar
            </Button>
          </CardContent>
        </Card>
      </main>
    </ClientProviders>
  );
}
