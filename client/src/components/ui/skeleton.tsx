import { cn } from "@/lib/utils";

/* Barrido de brillo (shimmer) en vez de un pulso plano — la animación
 * `shimmer` ya estaba declarada en tailwind.config.ts pero nunca se usaba. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded-md bg-gradient-to-r from-muted/50 via-muted/80 to-muted/50 bg-[length:200%_100%]",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
