'use client';

/**
 * MermaidBlock — renders a ```mermaid code block as an SVG diagram.
 *
 * mermaid (~2MB) is dynamically imported ONLY when a diagram is actually
 * present, so it never affects the first-load bundle of any page.
 */

import { useEffect, useState } from 'react';

interface MermaidBlockProps {
  code: string;
  id?: string;
  className?: string;
}

export function MermaidBlock({ code, id, className }: MermaidBlockProps) {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const renderId = id || `mermaid-${hashCode(code)}`;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const mermaid = await import('mermaid');
        const api = mermaid.default;

        api.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'strict',
          themeVariables: {
            darkMode: true,
            background: '#0a0a0f',
            primaryColor: '#111827',
            primaryTextColor: '#e2e8f0',
            primaryBorderColor: '#334155',
            lineColor: '#64748b',
            secondaryColor: '#0f172a',
            tertiaryColor: '#111827',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '13px',
          },
        });

        const existing = document.getElementById(renderId);
        if (existing) existing.remove();

        const { svg: rendered } = await api.render(renderId, code);
        if (!cancelled) setSvg(rendered);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, renderId]);

  if (error) {
    return (
      <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5 text-destructive text-xs font-mono">
        <span className="font-extrabold uppercase tracking-widest text-[9px] block mb-1">Diagrama no renderizado</span>
        {error}
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="h-24 flex items-center justify-center text-muted-fg text-xs font-mono animate-pulse">
        Renderizando diagrama...
      </div>
    );
  }

  return (
    <div
      className={`mermaid-block my-4 overflow-x-auto rounded-xl border border-border/50 bg-background/60 p-4 [&_svg]:mx-auto [&_svg]:max-w-full ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function hashCode(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
