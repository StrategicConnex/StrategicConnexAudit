"use client";

/**
 * TypingIndicator — "escribiendo…" animado (tres puntos en cascada).
 *
 * Se muestra mientras la petición está en vuelo Y aún no llegó el primer
 * chunk del stream: en cuanto empieza a llegar texto, el mensaje parcial del
 * asistente lo reemplaza. Accesible: `role="status"` + label — el anuncio
 * llega una vez, no en cada punto.
 */
export function TypingIndicator({ label }: { label: string }) {
  return (
    <div className="flex justify-start">
      <div
        role="status"
        aria-label={label}
        className="bg-muted/15 border-2 border-border/50 rounded-xl px-4 py-3 flex items-center gap-1.5"
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            aria-hidden="true"
            className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
            style={{ animationDelay: `${i * 150}ms`, animationDuration: "900ms" }}
          />
        ))}
        <span className="sr-only">{label}</span>
      </div>
    </div>
  );
}
