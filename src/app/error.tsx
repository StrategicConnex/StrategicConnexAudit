"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw, Shield } from "lucide-react";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error("[Global Error]", error);
  }, [error]);

  return (
    <div className="min-h-dvh w-full flex items-center justify-center bg-background relative overflow-hidden">
      {/* Background orbs */}
      <div className="absolute top-[-15%] left-[-15%] w-[50%] h-[50%] bg-destructive/8 blur-[150px] rounded-full animate-pulse"
        style={{ animationDuration: "8s" }} />
      <div className="absolute bottom-[-15%] right-[-15%] w-[50%] h-[50%] bg-indigo-600/6 blur-[120px] rounded-full animate-pulse hidden sm:block"
        style={{ animationDuration: "12s", animationDelay: "-1.5s" }} />

      {/* Scan-line overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.015]"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(255,255,255,0.03) 1px, rgba(255,255,255,0.03) 2px)",
          backgroundSize: "100% 2px",
        }}
      />

      <div className="z-10 w-full max-w-md px-4 sm:px-6 animate-fade-in">
        <div className="glass-card p-6 sm:p-8 relative text-center">
          {/* Top glow line */}
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-destructive/40 to-transparent" />

          {/* Error icon */}
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto mb-5 sm:mb-6">
            <AlertTriangle className="w-7 h-7 sm:w-8 sm:h-8 text-destructive" />
          </div>

          {/* Title */}
          <h1 className="font-display text-xl sm:text-2xl font-extrabold text-foreground tracking-tight mb-3">
            Error Interno del Servidor
          </h1>

          {/* Description */}
          <p className="text-sm sm:text-base text-muted-fg mb-2 leading-relaxed">
            Ocurrió un error inesperado al procesar tu solicitud.
          </p>
          <p className="text-xs sm:text-sm text-muted-fg/70 mb-6 sm:mb-8 leading-relaxed">
            Nuestro equipo ha sido notificado automáticamente. Si el problema persiste,
            intenta de nuevo más tarde.
          </p>

          {/* Error digest for support */}
          {error.digest && (
            <div className="bg-black/30 border border-border/30 rounded-xl p-3 mb-6 sm:mb-8 text-left">
              <p className="text-2xs sm:text-xs text-muted-fg/50 font-mono break-all">
                Error ID: <span className="text-muted-fg/70">{error.digest}</span>
              </p>
            </div>
          )}

          {/* Retry button */}
          <button
            onClick={reset}
            className="group relative inline-flex items-center justify-center gap-2 py-3 sm:py-3.5 px-6 rounded-xl bg-primary text-primary-foreground font-semibold focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background transition-all duration-300 active:scale-[0.97] overflow-hidden hover:bg-primary/90 shadow-lg shadow-primary/20 hover:shadow-primary/30"
          >
            {/* Shimmer */}
            <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            <span className="relative z-10 flex items-center gap-2">
              <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5 group-hover:rotate-180 transition-transform duration-500" />
              <span className="text-sm sm:text-base">Reintentar</span>
            </span>
          </button>

          {/* Footer */}
          <div className="mt-7 sm:mt-8 pt-5 sm:pt-6 border-t border-border">
            <div className="flex items-center justify-center gap-2 text-2xs sm:text-xs text-muted-fg/60">
              <Shield className="w-3 h-3" />
              <span>StrategicAudit Pro · Error Recovery</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
