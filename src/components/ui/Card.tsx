import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT Card — compound primitive over the `glass-card` @utility
   (globals.css). Matches the DS: olive-charcoal glass surfaces.
   variant="hero" uses the elevated glass-card-hero treatment.
   ═══════════════════════════════════════════════════════════════════════ */

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  ref?: React.Ref<HTMLDivElement>;
  /** default: glass · hero: glass elevado (firma) · elevation: superficie
   *  sólida sin borde (patrón Vercel — jerarquía por luminancia, el blur
   *  se reserva para overlays donde separa del contenido) · interactive:
   *  card corporativa con hover elevado (spec 2026-09-18 §5.3) */
  variant?: "default" | "hero" | "elevation" | "interactive";
}

export function Card({ className, variant = "default", ref, ...props }: CardProps) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-2xl relative",
        variant === "hero" && "glass-card-hero",
        variant === "default" && "glass-card",
        variant === "elevation" && "bg-surface-elevated shadow-[var(--shadow-card)]",
        variant === "interactive" &&
          "bg-corporate-surface-elevated border border-corporate-border shadow-corporate-card transition-[box-shadow,border-color] duration-150 hover:shadow-lg hover:border-corporate-primary/20",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ref, ...props }: HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return <div ref={ref} className={cn("flex flex-col gap-1 p-5 pb-0", className)} {...props} />;
}

export function CardTitle({ className, ref, ...props }: HTMLAttributes<HTMLHeadingElement> & { ref?: React.Ref<HTMLHeadingElement> }) {
  return (
    <h3
      ref={ref}
      className={cn("text-sm font-extrabold uppercase tracking-widest text-foreground", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ref, ...props }: HTMLAttributes<HTMLParagraphElement> & { ref?: React.Ref<HTMLParagraphElement> }) {
  return (
    <p
      ref={ref}
      className={cn("text-xs text-muted-fg leading-relaxed", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ref, ...props }: HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return <div ref={ref} className={cn("p-5", className)} {...props} />;
}

export function CardFooter({ className, ref, ...props }: HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return <div ref={ref} className={cn("flex items-center p-5 pt-0", className)} {...props} />;
}
