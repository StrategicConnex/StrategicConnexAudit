"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8">
      <div className="text-center">
        <h2 className="text-xl font-bold text-white">Algo salió mal</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Ha ocurrido un error inesperado. Por favor, intenta de nuevo.
        </p>
        {error.digest && (
          <p className="mt-1 text-xs text-zinc-500">Error: {error.digest}</p>
        )}
      </div>
      <button
        onClick={reset}
        className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 transition-colors"
      >
        Intentar de nuevo
      </button>
    </div>
  );
}
