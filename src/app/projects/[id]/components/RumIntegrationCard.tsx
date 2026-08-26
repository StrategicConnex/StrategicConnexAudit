'use client';

import React, { useState } from 'react';
import { Check, Copy, Server, Activity, CircleAlert, CircleCheck } from 'lucide-react';
import Link from 'next/link';

export interface RumStats {
  /** Eventos recibidos (ventana de los últimos 100 registros). */
  totalEvents: number;
  /** ISO string del último evento recibido, o null si nunca llegó nada. */
  lastEventAt: string | null;
  /** Sesiones únicas observadas en la ventana. */
  uniqueSessions: number;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'hace instantes';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

export function RumIntegrationCard({
  projectId,
  appUrl,
  stats,
}: {
  projectId: string;
  appUrl: string;
  stats: RumStats;
}) {
  const [copied, setCopied] = useState(false);

  const snippet = `<script
  src="${appUrl}/scripts/vitals.js"
  data-project-id="${projectId}"
  data-spa-tracking="true"
  data-sampling="1.0"
  defer>
</script>`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback para contextos sin clipboard API
      const ta = document.createElement('textarea');
      ta.value = snippet;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Estado de instalación derivado de la telemetría real recibida
  const isActive = stats.lastEventAt !== null;
  const isStale = isActive
    ? Date.now() - new Date(stats.lastEventAt!).getTime() > 24 * 60 * 60 * 1000
    : false;

  const status = !isActive
    ? { icon: <CircleAlert className="w-3.5 h-3.5 text-amber-400" />, label: 'Sin datos todavía', hint: 'Instala el snippet y visita tu sitio — la primera señal aparece en segundos.', cls: 'border-amber-400/20 bg-amber-400/5 text-amber-400' }
    : isStale
      ? { icon: <CircleAlert className="w-3.5 h-3.5 text-amber-400" />, label: `Última señal ${timeAgo(stats.lastEventAt!)}`, hint: 'No llegan eventos en más de 24 h — verifica que el snippet siga instalado.', cls: 'border-amber-400/20 bg-amber-400/5 text-amber-400' }
      : { icon: <CircleCheck className="w-3.5 h-3.5 text-emerald-400" />, label: `Recibiendo datos · última señal ${timeAgo(stats.lastEventAt!)}`, hint: null, cls: 'border-emerald-400/20 bg-emerald-400/5 text-emerald-400' };

  return (
    <div className="mt-12 p-8 bg-surface-muted/60 rounded-2xl border border-border relative overflow-hidden">
      <div className="absolute inset-0 tech-grid opacity-10 pointer-events-none" />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 relative z-10">
        <h3 className="text-2xs font-bold text-foreground uppercase tracking-widest flex items-center gap-2">
          <Server className="w-4 h-4 text-accent-cyan" /> Integración RUM (Real User Monitoring)
        </h3>
        <Link href={`/scripts/vitals.js`} className="text-2xs font-bold text-accent-cyan hover:text-accent-cyan/80 transition-colors uppercase tracking-widest">Documentación Técnica →</Link>
      </div>
      <p className="text-sm text-muted-foreground mb-5 max-w-2xl leading-relaxed relative z-10">
        Inserte este fragmento en el <code className="font-mono text-xs text-foreground">&lt;head&gt;</code> de su sitio web
        para capturar Core Web Vitals, errores JS, navegación SPA y sesiones reales directamente en su consola.
      </p>

      {/* Estado de instalación en vivo */}
      <div className={`inline-flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 rounded-xl border mb-5 relative z-10 ${status.cls}`}>
        <span className="flex items-center gap-2 text-2xs font-bold uppercase tracking-widest">
          {status.icon} {status.label}
        </span>
        {isActive && (
          <>
            <span className="flex items-center gap-1.5 text-2xs">
              <Activity className="w-3 h-3" /> {stats.totalEvents} eventos
            </span>
            <span className="text-2xs">{stats.uniqueSessions} sesiones únicas</span>
          </>
        )}
      </div>
      {status.hint && (
        <p className="text-2xs text-muted-foreground mb-5 -mt-3 relative z-10">{status.hint}</p>
      )}

      {/* Snippet con copiado */}
      <div className="relative group overflow-hidden rounded-xl border border-border relative z-10">
        <button
          onClick={copy}
          aria-label="Copiar snippet"
          className={`absolute top-3 right-3 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-2xs font-bold transition-all cursor-pointer ${
            copied
              ? 'bg-emerald-400/10 border-emerald-400/30 text-emerald-400'
              : 'bg-background/80 backdrop-blur border-border text-muted-foreground hover:text-foreground hover:border-primary/30'
          }`}
        >
          {copied ? <><Check className="w-3 h-3" /> Copiado</> : <><Copy className="w-3 h-3" /> Copiar</>}
        </button>
        <code className="block text-xs font-mono bg-background text-foreground p-6 overflow-x-auto whitespace-pre leading-relaxed">
{snippet}
        </code>
      </div>

      {/* Nota de atributos */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-2xs text-muted-foreground relative z-10">
        <p><code className="font-mono text-accent-cyan">data-spa-tracking</code> — captura navegaciones sin recarga (React, Vue, Next…).</p>
        <p><code className="font-mono text-accent-cyan">data-sampling</code> — fracción de visitantes que envía métricas (0.1 = 10%).</p>
      </div>
    </div>
  );
}
