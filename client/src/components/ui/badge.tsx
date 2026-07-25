import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        /* secondary/outline son informativas (unidad, estado neutro) — tinte
         * glass suave está bien acá. destructive/warning/success son alertas
         * de anomalía: se mantienen sólidas y de alto contraste a propósito,
         * una alerta de stock negativo no puede perder legibilidad por
         * estética — este software depende de que se lean sin ambigüedad. */
        secondary: "border-secondary/30 bg-secondary/15 text-secondary backdrop-blur-sm",
        outline: "border-border/70 bg-card/40 text-foreground backdrop-blur-sm",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        warning: "border-transparent bg-warning text-warning-foreground",
        success: "border-transparent bg-success text-success-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
