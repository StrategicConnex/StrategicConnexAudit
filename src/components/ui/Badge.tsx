import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT Badge — 3 variantes semánticas, nada más.
   - live:    oro (el acento) — señal en tiempo real, máx 1 por vista
   - alert:   rojo — requiere atención
   - neutral: muted — metadata, contadores, etiquetas
   ═══════════════════════════════════════════════════════════════════════ */

export type BadgeVariant = "live" | "alert" | "neutral";

const variants: Record<BadgeVariant, string> = {
  live: "bg-chartreuse/10 text-chartreuse border-chartreuse/20",
  alert: "bg-destructive/10 text-destructive border-destructive/20",
  neutral: "bg-muted/20 text-muted-fg border-border",
};

export function Badge({
  variant = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center text-2xs px-2 py-0.5 rounded-full font-bold border whitespace-nowrap",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
