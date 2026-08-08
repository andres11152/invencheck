import { cn } from "@/lib/utils";

const SIZE_MAP = {
  xs: 20,
  sm: 28,
  md: 36,
  lg: 48,
  xl: 64,
} as const;

type Variant = "color" | "blanco" | "icono";
type Size    = keyof typeof SIZE_MAP;

interface InvenCheckLogoProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  priority?: boolean; // Kept for interface compatibility
}

export function InvenCheckLogo({
  variant = "color",
  size = "md",
  className,
}: InvenCheckLogoProps) {
  const height = SIZE_MAP[size];

  // If "icono", we only render the checkmark cube icon.
  // Otherwise, we render the icon + "InvenCheck" text next to it.
  const isIconOnly = variant === "icono" || variant === "color"; // "color" was previously used for just the K icon in small cards

  const textClass = variant === "blanco" ? "text-white" : "text-foreground";
  const iconColor = "url(#invencheck-grad)";

  return (
    <div
      className={cn("inline-flex items-center gap-2 select-none", className)}
      style={{ height }}
    >
      <svg
        viewBox="0 0 100 100"
        className="h-full w-auto aspect-square"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="invencheck-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#1D4ED8" />
          </linearGradient>
          <linearGradient id="invencheck-grad-accent" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10B981" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
        </defs>
        {/* Hexagonal/Cube box shape representing inventory */}
        <path
          d="M50 15 L85 35 L85 75 L50 95 L15 75 L15 35 Z"
          fill={iconColor}
          opacity="0.15"
        />
        <path
          d="M50 15 L85 35 L85 75 L50 95 L15 75 L15 35 Z"
          stroke={iconColor}
          strokeWidth="6"
          strokeLinejoin="round"
        />
        {/* Inside lines to make it look like a box */}
        <path
          d="M50 15 L50 95"
          stroke={iconColor}
          strokeWidth="4"
          strokeDasharray="4 4"
        />
        <path
          d="M15 35 L50 55 L85 35"
          stroke={iconColor}
          strokeWidth="4"
        />
        {/* Checkmark inside the box */}
        <path
          d="M35 52 L47 64 L68 38"
          stroke="url(#invencheck-grad-accent)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {!isIconOnly && (
        <span
          className={cn("font-bold tracking-tight", textClass)}
          style={{ fontSize: height * 0.55 }}
        >
          Inven<span className="text-blue-600 font-extrabold">Check</span>
        </span>
      )}
    </div>
  );
}
