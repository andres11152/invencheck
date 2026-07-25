import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/*
 * TIPOGRAFÍA CORPORATIVA COLSUBSIDIO / INVENCHECK
 * Inter  → texto principal (legible en pantallas de bodega)
 * JetBrains Mono → cantidades, códigos, referencia numérica
 * Variables CSS conectadas con tailwind.config.ts fontFamily
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  preload: true,
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "InvenCheck — Toma Física de Inventario | Colsubsidio",
  description:
    "Captura inteligente de inventario físico por voz para bodegas y hoteles Colsubsidio. Reduce errores de transcripción y acelera el cierre mensual.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "InvenCheck",
  },
  // Estándar moderno de PWA instalable en Android/Chrome (evita deprecation warning
  // sobre apple-mobile-web-app-capable, que sigue siendo necesario para iOS/Safari).
  other: {
    "mobile-web-app-capable": "yes",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  /* themeColor = Azul Colsubsidio oficial #0067B1 */
  themeColor: "#0067B1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans min-h-screen bg-background text-foreground antialiased`}
      >
        {/*
          Manchas de fondo estáticas (sin animación) para que el glassmorphism
          tenga algo de profundidad detrás que difuminar — sobre un fondo
          plano, backdrop-blur no se nota. Sin movimiento a propósito: son
          tablets encendidas toda la jornada en bodega, no vale la pena el
          gasto de GPU/batería de una animación continua aquí.
        */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 -left-32 h-[32rem] w-[32rem] rounded-full bg-azul-100/20 blur-3xl" />
          <div className="absolute top-1/3 -right-40 h-[28rem] w-[28rem] rounded-full bg-amarillo-100/[0.12] blur-3xl" />
          <div className="absolute bottom-[-10rem] left-1/4 h-[26rem] w-[26rem] rounded-full bg-azul-60/[0.14] blur-3xl" />
        </div>
        {children}
      </body>
    </html>
  );
}
