"use client";

import { useEffect } from "react";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Boundary global — sustituye al root layout cuando este falla, por eso
 * define su propio `<html>`/`<body>` y NO depende del CSS de layouts
 * (todo el estilo es inline). Ver Next.js `global-error` file convention.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("[Global Error]", error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0f",
          color: "#e8e8f0",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ maxWidth: 420, padding: 32, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, margin: "0 0 12px", letterSpacing: "-0.02em" }}>
            Error Crítico del Servidor
          </h1>
          <p style={{ fontSize: 14, opacity: 0.75, margin: "0 0 8px", lineHeight: 1.6 }}>
            Ocurrió un error inesperado y la página no pudo cargarse.
          </p>
          <p style={{ fontSize: 12, opacity: 0.6, margin: "0 0 24px", lineHeight: 1.6 }}>
            Intenta de nuevo más tarde. Si el error persiste, reporta el Error ID
            indicado.
          </p>
          {error.digest && (
            <p
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: 12,
                opacity: 0.7,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                padding: "8px 12px",
                display: "inline-block",
              }}
            >
              Error ID: {error.digest}
            </p>
          )}
          <div>
            <button
              onClick={reset}
              style={{
                marginTop: 24,
                padding: "10px 28px",
                borderRadius: 10,
                border: "none",
                background: "#6366f1",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Reintentar
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
