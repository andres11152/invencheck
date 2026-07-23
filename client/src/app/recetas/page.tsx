"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChefHat, ArrowLeft } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { Receta } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function RecetasPage() {
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    api
      .getRecetas()
      .then((data) => {
        if (!cancelado) setRecetas(data);
      })
      .catch((err: unknown) => {
        if (!cancelado) setError(err instanceof ApiError ? err.message : "Error al cargar recetas");
      })
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-4 sm:p-8">
      <header className="space-y-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Bodegas
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ChefHat className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold sm:text-2xl">Recetas</h1>
            <p className="text-sm text-muted-foreground">
              Elige una receta para calcular qué insumos hacen falta pedir
            </p>
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {cargando &&
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}

        {!cargando &&
          recetas.map((receta) => (
            <Link key={receta.id} href={`/recetas/${receta.id}`}>
              <Card className="p-4 transition-colors hover:border-primary/60 hover:bg-accent/40">
                <p className="font-medium">{receta.nombre}</p>
                <p className="text-sm text-muted-foreground">
                  Receta base para {receta.porciones} porciones
                </p>
              </Card>
            </Link>
          ))}

        {!cargando && recetas.length === 0 && !error && (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No hay recetas registradas todavía.
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
