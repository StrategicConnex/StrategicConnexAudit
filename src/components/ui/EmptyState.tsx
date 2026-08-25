import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT EmptyState — vacío como invitación a actuar (no como mood).
   Icono + título de 1 línea + acción primaria opcional.
   ═══════════════════════════════════════════════════════════════════════ */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("radar-grid flex flex-col items-center justify-center py-20 px-6 text-center rounded-xl border border-border/40", className)}>
      {icon && (
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted/40 text-muted-fg [&_svg]:size-6">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted-fg leading-relaxed">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
