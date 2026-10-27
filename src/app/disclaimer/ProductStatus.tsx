import { CheckCircle2, Clock } from "lucide-react";

/** Tipo espejo del namespace "disclaimer.status" del JSON local. */
export type ProductStatusMessages = {
  title: string;
  intro: string;
  resolvedTitle: string;
  inProgressTitle: string;
  resolved: string[];
  inProgress: string[];
  note: string;
};

/**
 * Resumen público del estado del producto: lo ya resuelto y lo que está en
 * implementación. Es informativo y no altera la aceptación del aviso legal.
 */
export function ProductStatus({ messages }: { messages: ProductStatusMessages }) {
  return (
    <section
      aria-labelledby="product-status-title"
      className="rounded-lg border border-border bg-card/40 p-6"
    >
      <h2 id="product-status-title" className="font-semibold text-foreground">
        {messages.title}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{messages.intro}</p>

      <div className="mt-5 grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-foreground/80">
            <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
            {messages.resolvedTitle}
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {messages.resolved.map((item) => (
              <li key={item} className="list-none pl-5 leading-relaxed">
                <span className="mr-1 text-primary/80">•</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-foreground/80">
            <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />
            {messages.inProgressTitle}
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {messages.inProgress.map((item) => (
              <li key={item} className="list-none pl-5 leading-relaxed">
                <span className="mr-1 text-muted-foreground/70">•</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-5 text-xs text-muted-foreground/80">{messages.note}</p>
    </section>
  );
}
