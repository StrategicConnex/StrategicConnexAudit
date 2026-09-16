import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

interface PageShellBarProps {
  backHref?: string;
  backLabel?: string;
  maxWidth?: string;
}

/**
 * Barra superior compartida por las páginas fuera del dashboard
 * (/mitre-coverage, /security/audit, /settings/api-keys, /ai/health):
 * mismo enlace de vuelta, mismo ritmo. Sin ella cada página inventaba
 * su propio chrome (o ninguno).
 */
export function PageShellBar({ backHref = "/", backLabel = "Volver al panel", maxWidth = "max-w-7xl" }: PageShellBarProps) {
  return (
    <div className={`${maxWidth} mx-auto px-4 sm:px-6 pt-5 sm:pt-6`}>
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-xs text-muted-fg hover:text-primary transition-colors"
      >
        <ArrowLeft aria-hidden="true" className="w-3.5 h-3.5" />
        {backLabel}
      </Link>
    </div>
  );
}

interface PageShellProps extends PageShellBarProps {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function PageShell({
  title,
  subtitle,
  actions,
  children,
  backHref,
  backLabel,
  maxWidth = "max-w-5xl",
}: PageShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PageShellBar backHref={backHref} backLabel={backLabel} maxWidth={maxWidth} />
      <div className={`relative z-10 mx-auto px-4 sm:px-6 pb-10 pt-2 ${maxWidth}`}>
        {(title || subtitle || actions) && (
          <header className="flex flex-wrap items-end justify-between gap-4 mb-8">
            <div>
              {title && (
                <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground">{title}</h1>
              )}
              {subtitle && <p className="text-sm text-muted-fg mt-1">{subtitle}</p>}
            </div>
            {actions}
          </header>
        )}
        {children}
      </div>
    </div>
  );
}
