'use client';

import React, { useState } from 'react';
import { Check, Copy, Server, Activity, CircleAlert, CircleCheck, Eye, EyeOff, KeyRound, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { rotateBeaconSecret } from '@/app/actions/projects';

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

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/** Helper de módulo (como timeAgo): evita llamadas impuras directas durante el render. */
function isStaleEvent(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() > STALE_THRESHOLD_MS;
}

export function RumIntegrationCard({
  projectId,
  appUrl,
  stats,
  beaconSecret,
  canRotate = true,
}: {
  projectId: string;
  appUrl: string;
  stats: RumStats;
  /** Secreto del beacon (null = proyecto legacy sin secreto). */
  beaconSecret: string | null;
  /** A-3: solo owner/admin ven el botón de rotar. */
  canRotate?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [secret, setSecret] = useState<string | null>(beaconSecret);
  const [showSecret, setShowSecret] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotated, setRotated] = useState(false);

  const snippet = `<script
  src="${appUrl}/scripts/vitals.js"
  data-project-id="${projectId}"${secret ? `\n  data-beacon-token="${secret}"` : ''}
  data-spa-tracking="true"
  data-sampling="1.0"
  defer>
</script>`;

  const masked = secret ? `${secret.slice(0, 6)}…${secret.slice(-4)}` : null;

  /**
   * Lo que se MUESTRA en pantalla (attack-surface anti copy-manual, incidente
   * 2026-10-19: el owner copió a mano el texto visible y puso el valor mal en
   * la env). El SNIPPET real (con el token íntegro) viaja único y exclusivo
   * por los botones «Copiar snippet» / «Copiar token» — nunca quedando a la
   * vista del shoulder-surfing salvo «Ver» explícito.
   */
  const displaySnippet =
    secret && !showSecret
      ? snippet.replace(`data-beacon-token="${secret}"`, `data-beacon-token="${masked}"`)
      : snippet;

  const rotate = async () => {
    setRotating(true);
    try {
      const result = await rotateBeaconSecret({ projectId });
      if (result.data?.beaconSecret) {
        setSecret(result.data.beaconSecret);
        setRotated(true);
        // Seguridad: el token NUEVO nunca queda expuesto sin acción explícita
        setShowSecret(false);
        setTimeout(() => setRotated(false), 4000);
      }
    } finally {
      setRotating(false);
    }
  };

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

  /**
   * Copia SOLO el token (no el snippet) para pegarlo directo en las env vars
   * (p. ej. NEXT_PUBLIC_RUM_BEACON_TOKEN del self-RUM). Evita el error del
   * 2026-10-19: copiar el texto enmascarado de la UI ("79ed10…b49c") y que el
   * beacon devolviera 401. Mismo fallback execCommand sin clipboard API.
   */
  const copyToken = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = secret;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  // Estado de instalación derivado de la telemetría real recibida
  const isActive = stats.lastEventAt !== null;
  const isStale = isActive ? isStaleEvent(stats.lastEventAt!) : false;

  const status = !isActive
    ? { icon: <CircleAlert className="w-3.5 h-3.5 text-chart-warning" />, label: 'Sin datos todavía', hint: 'Instala el snippet y visita tu sitio — la primera señal aparece en segundos.', cls: 'border-chart-warning/20 bg-chart-warning/5 text-chart-warning' }
    : isStale
      ? { icon: <CircleAlert className="w-3.5 h-3.5 text-chart-warning" />, label: `Última señal ${timeAgo(stats.lastEventAt!)}`, hint: 'No llegan eventos en más de 24 h — verifica que el snippet siga instalado.', cls: 'border-chart-warning/20 bg-chart-warning/5 text-chart-warning' }
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

      {/* Pasos de instalación */}
      <ol className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5 relative z-10">
        {[
          'Pegue el snippet en el <head>',
          'Visite su sitio web',
          'Verifique la primera señal aquí',
        ].map((step, i) => (
          <li key={i} className="flex items-center gap-2.5 rounded-xl border border-border bg-background/60 px-3 py-2.5">
            <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-2xs font-extrabold text-primary">
              {i + 1}
            </span>
            <span className="text-2xs font-semibold text-muted-foreground">{step}</span>
          </li>
        ))}
      </ol>

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
          {copied ? <><Check className="w-3 h-3" /> Snippet copiado</> : <><Copy className="w-3 h-3" /> Copiar snippet</>}
        </button>
        <code className="block text-xs font-mono bg-background text-foreground p-6 overflow-x-auto whitespace-pre leading-relaxed">
{displaySnippet}
        </code>
      </div>
      {secret && !showSecret && (
        <p className="mt-2 text-2xs text-muted-foreground relative z-10">
          El token aparece enmascarado — use <strong className="text-foreground">«Copiar snippet»</strong> o{' '}
          <strong className="text-foreground">«Copiar token»</strong> para obtener el valor real (nunca copie este texto a mano).
        </p>
      )}

      {/* Nota de atributos */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-2xs text-muted-foreground relative z-10">
        <p><code className="font-mono text-accent-cyan">data-spa-tracking</code> — captura navegaciones sin recarga (React, Vue, Next…).</p>
        <p><code className="font-mono text-accent-cyan">data-sampling</code> — fracción de visitantes que envía métricas (0.1 = 10%).</p>
      </div>

      {/* Secreto del beacon (P0-3): solo quien tenga este token puede enviar datos.
          Ver/Ocultar A-3: igual que rotar, solo owner/admin (reveal = mismo
          privilegio que recibir el snippet completo, que ya trae el token). */}
      <div className="mt-4 p-4 rounded-xl border border-border bg-background/60 flex flex-col sm:flex-row sm:items-center gap-3 relative z-10">
        <div className="flex items-center gap-2 text-2xs font-bold uppercase tracking-widest text-muted-foreground">
          <KeyRound className="w-3.5 h-3.5 text-accent-cyan" />
          {secret ? (
            <span>
              Token del beacon:{' '}
              <code className="font-mono text-foreground">
                {showSecret ? secret : masked}
              </code>
            </span>
          ) : (
            <span>Sin token: cualquiera con el ID puede enviar datos. Genéralo.</span>
          )}
        </div>
        {secret && (
          <>
            <button
              onClick={() => setShowSecret((s) => !s)}
              aria-label={showSecret ? 'Ocultar token' : 'Ver token'}
              disabled={!canRotate}
              title={canRotate ? undefined : 'Solo administradores pueden ver el token'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-2xs font-bold uppercase tracking-widest text-muted-fg hover:text-foreground hover:border-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {showSecret ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {showSecret ? 'Ocultar' : 'Ver'}
            </button>
            <button
              onClick={copyToken}
              aria-label="Copiar token"
              disabled={!canRotate}
              title={canRotate ? undefined : 'Solo administradores pueden copiar el token'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-2xs font-bold uppercase tracking-widest transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                copiedToken
                  ? 'bg-emerald-400/10 border-emerald-400/30 text-emerald-400'
                  : 'border-border text-muted-fg hover:text-foreground hover:border-primary/30'
              }`}
            >
              {copiedToken ? <><Check className="w-3 h-3" /> Token copiado</> : <><Copy className="w-3 h-3" /> Copiar token</>}
            </button>
          </>
        )}
        <button
          onClick={rotate}
          disabled={rotating || !canRotate}
          title={canRotate ? undefined : "Solo administradores pueden rotar el token"}
          className="sm:ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-2xs font-bold uppercase tracking-widest text-muted-fg hover:text-foreground hover:border-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <RefreshCw className={`w-3 h-3 ${rotating ? 'animate-spin' : ''}`} />
          {rotated ? '¡Token actualizado!' : secret ? 'Rotar token' : 'Generar token'}
        </button>
      </div>
    </div>
  );
}
