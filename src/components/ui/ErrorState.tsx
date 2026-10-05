/**
 * ErrorState.tsx — estado de error reutilizable de los tabs del dashboard.
 *
 * Antes cada tab decidía por su cuenta qué hacer si su fetch fallaba: unos
 * otros nada, y ninguno ofrecía reintentar sin recargar. Este componente
 * centraliza la forma: icono, mensaje, detalle técnico opcional y acción.
 *
 * Usa `role="alert"` para que un lector de pantalla anuncie el fallo, y un
 * `type="button"` explícito para que el botón no dispare el submit de un
 * formulario contenedor.
 */

import { AlertTriangle, RefreshCw } from "lucide-react";

export interface ErrorStateProps {
  /** Título corto, por ejemplo "No se pudo cargar la telemetría". */
  title: string;
  /** Explicación en una línea de qué falló y qué puede hacer el usuario. */
  description?: string;
  /** Detalle técnico (mensaje del servidor). Se muestra monoespaciado. */
  detail?: string | null;
  /** Etiqueta del botón de reintento. Sin `onRetry` no se renderiza. */
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  title,
  description,
  detail,
  onRetry,
  retryLabel = "Reintentar",
  className = "",
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/25 bg-destructive/5 px-6 py-10 text-center ${className}`}
    >
      <AlertTriangle size={22} className="text-destructive" aria-hidden="true" />

      <div className="space-y-1">
        <p className="text-sm font-bold text-foreground">{title}</p>
        {description ? (
          <p className="text-xs text-muted-fg max-w-md">{description}</p>
        ) : null}
      </div>

      {detail ? (
        <pre className="max-w-full overflow-x-auto rounded-md border border-border/50 bg-muted/10 px-3 py-2 text-2xs font-mono text-muted-fg">
          {detail}
        </pre>
      ) : null}

      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-muted/10 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5"
        >
          <RefreshCw size={13} aria-hidden="true" />
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

export default ErrorState;
