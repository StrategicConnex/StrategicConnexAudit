import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT Skeleton — placeholder de carga con identidad NOC.
   Usa radar-grid + tech-shimmer (@utility de globals.css) para que el
   estado de carga sea visible sobre dark (bg-surface-muted solo era un
   5% de luminancia sobre el fondo → parecía un vacío).
   ═══════════════════════════════════════════════════════════════════════ */

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("radar-grid tech-shimmer rounded-lg border border-border/40", className)}
      {...props}
    />
  );
}

/** Grupo de skeletons con delay escalonado (efecto "escaneo secuencial") */
export function SkeletonList({
  count = 4,
  itemClassName,
  className,
}: {
  count?: number;
  itemClassName?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)} role="status" aria-label="Cargando">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cn("h-32", itemClassName)} style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </div>
  );
}
