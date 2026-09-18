"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface RouteErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** Optional route label shown in the footer. */
  routeLabel?: string;
}

/**
 * Reusable error boundary for route-level error.tsx files.
 * Matches the polished design language of the root error.tsx.
 */
export function RouteErrorBoundary({
  error,
  reset,
  routeLabel,
}: RouteErrorBoundaryProps) {
  useEffect(() => {
    console.error(`[Route Error${routeLabel ? ` — ${routeLabel}` : ""}]`, error);
  }, [error, routeLabel]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8">
      <div className="text-center max-w-sm">
        {/* Icon */}
        <div
          className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4",
            "bg-destructive/10 border border-destructive/20"
          )}
        >
          <AlertTriangle className="w-6 h-6 text-destructive" />
        </div>

        {/* Title */}
        <h2 className="text-lg font-bold text-foreground">
          Algo salió mal
        </h2>

        {/* Description */}
        <p className="mt-2 text-sm text-muted-fg">
          Ha ocurrido un error inesperado. Por favor, intenta de nuevo.
        </p>

        {/* Error digest */}
        {error.digest && (
          <p className="mt-2 text-xs text-muted-fg/50 font-mono break-all">
            Error: {error.digest}
          </p>
        )}
      </div>

      {/* Retry button */}
      <button
        onClick={reset}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg px-4 py-2",
          "bg-primary text-primary-foreground text-sm font-medium",
          "hover:bg-primary/90 transition-colors",
          "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
        )}
      >
        <RotateCcw className="w-4 h-4" />
        Intentar de nuevo
      </button>

      {/* Footer */}
      {routeLabel && (
        <p className="text-xs text-muted-fg/40 mt-2">{routeLabel}</p>
      )}
    </div>
  );
}
