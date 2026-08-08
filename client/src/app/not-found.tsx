"use client";

// Forzar render dinámico para evitar fallas de renderizado estático de contextos en el server
export const dynamic = "force-dynamic";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientProviders } from "@/components/client-providers";
import { InvenCheckLogo } from "@/components/invencheck-logo";

function NotFoundContent() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm animate-in fade-in-0 zoom-in-95 duration-500 backdrop-blur-2xl">
        <CardHeader className="items-center text-center">
          {/* Logo InvenCheck sobre fondo azul */}
          <div className="mb-4 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary p-2 shadow-lg">
            <InvenCheckLogo variant="color" size="sm" priority />
          </div>
          <CardTitle>Página no encontrada</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Esta ruta no existe o no está disponible en InvenCheck.
          </p>
        </CardHeader>
        <CardContent>
          <Button asChild size="lg" className="w-full">
            <Link href="/">Volver a Bodegas</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

// Al igual que las páginas dinámicas: sin "use client" + ClientProviders acá,
// "Collect page data" de `next build` falla con
// `TypeError: n.createContext is not a function`. Ver nota en app/page.tsx.
export default function NotFound() {
  return (
    <ClientProviders>
      <NotFoundContent />
    </ClientProviders>
  );
}
