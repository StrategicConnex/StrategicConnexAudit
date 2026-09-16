import type { ReactNode } from "react";
import { HelpCircle } from "lucide-react";

interface JargonTermProps {
  /** Explicación en palabras llanas. Se anuncia a lectores de pantalla y se ve al pasar el cursor. */
  term: string;
  children: ReactNode;
}

/**
 * Envuelve un tecnicismo (LCP, GSC, MITRE…) con su explicación.
 * El usuario sin conocimientos nunca debería tener que adivinar siglas.
 */
export function JargonTerm({ term, children }: JargonTermProps) {
  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <button
        type="button"
        aria-label={term}
        title={term}
        className="inline-flex text-muted-fg/70 hover:text-primary transition-colors cursor-help"
      >
        <HelpCircle aria-hidden="true" className="w-3.5 h-3.5" />
      </button>
    </span>
  );
}
