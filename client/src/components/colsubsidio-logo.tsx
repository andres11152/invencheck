/**
 * ColsubsidioLogo — Componente oficial del logo Colsubsidio
 *
 * VARIANTES:
 *   "color"  → Logo ícono amarillo (LogoV1): usar sobre fondos oscuros/azules
 *   "blanco" → Logo horizontal texto blanco (LogoV2): usar sobre fondos de marca azul
 *   "icono"  → Alias de "color", recorta solo el ícono cuadrado
 *
 * TAMAÑOS:
 *   "xs" | "sm" | "md" | "lg" | "xl" — controlan el alto fijo; el ancho es proporcional
 *
 * REGLA: este componente es la ÚNICA forma de renderizar el logo Colsubsidio.
 * No importar las imágenes directamente en otros componentes.
 */

import Image from "next/image";
import { cn } from "@/lib/utils";

/* ── Rutas públicas ── */
const LOGO_PATHS = {
  /** Ícono K amarillo · 309×309, glifo recortado y centrado con margen parejo ·
   * uso: badges, app icons, fondos oscuros. (El archivo original traía el
   * glifo real ocupando solo ~18% de un lienzo 1200×1200, con además un
   * rectángulo blanco opaco no intencional al costado — casi invisible al
   * escalarlo en íconos pequeños como el de AlmacenCard. Se recortó al bbox
   * real del amarillo y se re-centró sobre transparente.) */
  color:  "/brand/logo-color.png",
  /** Logo horizontal texto blanco · 820×174 · uso: panel de marca azul */
  blanco: "/brand/logo-blanco.png",
} as const;

/* ── Dimensiones intrínsecas (para aspect-ratio correcto) ── */
const INTRINSIC = {
  color:  { width: 309, height: 309 },
  blanco: { width: 820, height: 174  },
} as const;

/* ── Alturas renderizadas por tamaño ── */
const SIZE_MAP = {
  xs: 20,
  sm: 28,
  md: 36,
  lg: 48,
  xl: 64,
} as const;

type Variant = "color" | "blanco" | "icono";
type Size    = keyof typeof SIZE_MAP;

interface ColsubsidioLogoProps {
  /** Qué versión del logo renderizar */
  variant?: Variant;
  /** Tamaño predefinido del alto (ancho es proporcional) */
  size?: Size;
  /** Clases CSS adicionales para el contenedor img */
  className?: string;
  /** Prioridad de carga (true en above-the-fold) */
  priority?: boolean;
}

export function ColsubsidioLogo({
  variant = "color",
  size = "md",
  className,
  priority = false,
}: ColsubsidioLogoProps) {
  /* "icono" es alias de "color" */
  const key: "color" | "blanco" = variant === "blanco" ? "blanco" : "color";
  const src    = LOGO_PATHS[key];
  const dims   = INTRINSIC[key];
  const height = SIZE_MAP[size];

  /* Mantener aspect ratio: width = height * (intrinsic.width / intrinsic.height) */
  const width = Math.round(height * (dims.width / dims.height));

  const altText =
    key === "blanco"
      ? "Colsubsidio — logo horizontal blanco"
      : "Colsubsidio — ícono marca";

  return (
    <Image
      src={src}
      alt={altText}
      width={width}
      height={height}
      priority={priority}
      className={cn("object-contain", className)}
      draggable={false}
    />
  );
}
