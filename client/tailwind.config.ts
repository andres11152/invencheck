import type { Config } from "tailwindcss";

/*
 * COLSUBSIDIO DESIGN SYSTEM — TAILWIND CONFIG
 *
 * CONVENCIÓN:
 *   - Todos los colores referencian CSS custom properties (hsl(var(--xxx)))
 *   - NUNCA hardcodear valores hex/rgb aquí ni en componentes
 *   - La fuente de verdad de los primitivos de marca vive en globals.css
 *   - Los componentes usan clases semánticas: bg-primary, text-secondary, etc.
 */

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1280px" },
    },
    extend: {
      colors: {
        /* ── Tokens semánticos (los que usan los componentes) ── */
        background:  "hsl(var(--background))",
        foreground:  "hsl(var(--foreground))",

        card: {
          DEFAULT:    "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT:    "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },

        /* Primario → Azul Colsubsidio #0067B1 */
        primary: {
          DEFAULT:    "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },

        /* Secundario → Amarillo Colsubsidio #FFD000 */
        secondary: {
          DEFAULT:    "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },

        muted: {
          DEFAULT:    "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT:    "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT:    "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        warning: {
          DEFAULT:    "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        success: {
          DEFAULT:    "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        info: {
          DEFAULT:    "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },

        border: "hsl(var(--border))",
        input:  "hsl(var(--input))",
        ring:   "hsl(var(--ring))",

        /* ── Escala completa de primitivos de marca ──
         * Disponibles como bg-amarillo-60, text-azul-100, etc.
         * Usar sólo cuando los tokens semánticos no sean suficientes
         * (ej. ilustraciones, brand moments, charts). */
        amarillo: {
          "20":  "hsl(var(--csb-amarillo-20))",
          "40":  "hsl(var(--csb-amarillo-40))",
          "60":  "hsl(var(--csb-amarillo-60))",
          "80":  "hsl(var(--csb-amarillo-80))",
          "100": "hsl(var(--csb-amarillo-100))",
          DEFAULT: "hsl(var(--csb-amarillo-100))",
        },
        azul: {
          "20":  "hsl(var(--csb-azul-20))",
          "40":  "hsl(var(--csb-azul-40))",
          "60":  "hsl(var(--csb-azul-60))",
          "80":  "hsl(var(--csb-azul-80))",
          "100": "hsl(var(--csb-azul-100))",
          DEFAULT: "hsl(var(--csb-azul-100))",
        },
        grafito: {
          "20":  "hsl(var(--csb-grafito-20))",
          "40":  "hsl(var(--csb-grafito-40))",
          "60":  "hsl(var(--csb-grafito-60))",
          "80":  "hsl(var(--csb-grafito-80))",
          "100": "hsl(var(--csb-grafito-100))",
          DEFAULT: "hsl(var(--csb-grafito-100))",
        },
      },

      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },

      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to:   { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to:   { height: "0" },
        },
        /* Pulse ring usando amarillo Colsubsidio (alerta de anomalía) */
        "pulse-ring": {
          "0%":   { boxShadow: "0 0 0 0 hsl(var(--csb-amarillo-100) / 0.65)" },
          "100%": { boxShadow: "0 0 0 18px hsl(var(--csb-amarillo-100) / 0)" },
        },
        /* Shimmer para skeletons en bodega */
        shimmer: {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        /* Entrada suave de modales */
        "fade-in": {
          from: { opacity: "0", transform: "scale(0.97) translateY(4px)" },
          to:   { opacity: "1", transform: "scale(1) translateY(0)" },
        },
      },

      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up":   "accordion-up 0.2s ease-out",
        "pulse-ring":     "pulse-ring 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        shimmer:          "shimmer 1.8s linear infinite",
        "fade-in":        "fade-in 0.25s ease-out",
      },

      /* Tipografía corporativa (Inter como sans principal, Mono para cantidades) */
      fontFamily: {
        sans:  ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono:  ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
