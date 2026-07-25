"use client";

import { AuthProvider } from "./auth-provider";
import { Toaster } from "./ui/sonner";
import { ServiceWorkerRegistration } from "./service-worker-registration";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      {children}
      <Toaster position="top-center" richColors />
      <ServiceWorkerRegistration />
    </AuthProvider>
  );
}
