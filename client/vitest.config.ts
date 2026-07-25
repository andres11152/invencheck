import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      // Cobertura acotada a los módulos que ya tienen tests dirigidos, no a
      // todo `src/` — incluir el resto (páginas, componentes sin test aún)
      // solo diluiría el número sin proteger nada real. Ampliar esta lista a
      // medida que se agreguen tests nuevos, no bajar el umbral para que
      // "cierre" con código sin cubrir.
      include: [
        "src/lib/auth-storage.ts",
        "src/lib/api.ts",
        "src/hooks/use-offline-sync.ts",
        "src/components/anomalia-modal.tsx",
      ],
      thresholds: {
        statements: 73,
        branches: 60,
        functions: 52,
        lines: 78,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
