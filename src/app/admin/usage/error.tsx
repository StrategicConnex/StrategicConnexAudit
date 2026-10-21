"use client";

export default function UsageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  if (process.env.NODE_ENV !== "production") {
    console.error("[admin/usage] boundary:", error);
  }
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <p className="text-sm text-muted-foreground">No se pudo cargar el panel de uso.</p>
      <button
        onClick={reset}
        className="mt-3 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-card/80"
      >
        Reintentar
      </button>
    </div>
  );
}
