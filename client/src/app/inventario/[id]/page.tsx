"use client";

// Ver nota en app/page.tsx: necesario para que "Collect page data" de
// `next build` no falle con `TypeError: n.createContext is not a function`.
export const dynamic = "force-dynamic";

import { ClientProviders } from "@/components/client-providers";
import { InventarioPageContent } from "./inventario-page-content";

export default function InventarioPage({ params }: { params: { id: string } }) {
  return (
    <ClientProviders>
      <InventarioPageContent params={params} />
    </ClientProviders>
  );
}
