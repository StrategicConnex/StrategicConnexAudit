"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Activity, Wifi, WifiOff, Clock, AlertTriangle, TrendingUp, Radio } from "lucide-react";
import { formatTime } from '@/shared/utils/datetime';
import { isFlagEnabled } from '@/shared/lib/flags';

/**
 * BARRA DE MÉTRICAS LIVE — Realtime como mecanismo principal, polling como fallback.
 *
 * ADR-004 (Enmienda), §12.1. Antes: `setInterval(poll, 15000)` era el mecanismo único.
 * Ahora: suscripción a `intelligence_run_events` y el sondeo de 15 s solo cuando el
 * Realtime no está disponible.
 *
 * DOS COSAS QUE NO SON OBVIAS Y QUE CONDICIONAN TODO EL RESTO
 *
 * 1. `intelligence_run_events` NO tiene `project_id`. Filtra por `investigation_id`,
 *    y su policy `intelligence_run_events_select_member_or_owner` (migración 0022)
 *    resuelve la pertenencia por subquery sobre `intelligence_investigations` porque
 *    no podría hacerlo por proyecto. Filtrar por `project_id` aquí no filtraría nada:
 *    la columna no existe y el filtro no aplicaría.
 *
 * 2. RLS no es la última línea, es la primera. La policy acota las filas en el
 *    servidor, pero Realtime puede fallar abierto ante un despliegue mal hecho, así
 *    que el callback vuelve a comprobar `investigation_id`. Es el mismo patrón que
 *    `useInvestigationRealtime` y `useRealtimeMetrics` (CHANGE-003).
 */

/** Periodo del sondeo de respaldo. El mismo que el polling que sustituye. */
const FALLBACK_MS = 15_000;

/**
 * Margen de gracia para la confirmación del canal. Si el canal no confirma en este
 * plazo se degrada a polling aunque Realtime no haya reportado error: un canal que
 * se queda en "conectando" sin decir nada deja la barra congelada, y congelada sin
 * decirlo es peor que degradada.
 */
const SUBSCRIBE_GRACE_MS = 4_000;

/** Fuente de datos activa. El polling nunca corre en la ruta feliz. */
export type LiveTransport = "realtime" | "fallback";

export type LiveMetrics = {
  connected: boolean;
  /** Qué fuente está alimentando la barra; se muestra al usuario (REQ-5). */
  transport: LiveTransport;
  uptimePercent: number | null;
  avgLatencyMs: number | null;
  lastCheckTimestamp: string | null;
  criticalFindingsCount: number;
  highFindingsCount: number;
  eventsCount: number;
  lastEventTimestamp: string | null;
};

interface LiveMetricsBarProps {
  projectId?: string;
  investigationId?: string;
}

export function LiveMetricsBar({ projectId, investigationId }: LiveMetricsBarProps) {
  const t = useTranslations("live");
  const [metrics, setMetrics] = useState<LiveMetrics>({
    connected: false, transport: "fallback", uptimePercent: null, avgLatencyMs: null,
    lastCheckTimestamp: null, criticalFindingsCount: 0,
    highFindingsCount: 0, eventsCount: 0, lastEventTimestamp: null,
  });
  const [expanded, setExpanded] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  /** Espejo del transporte: el handler de `subscribe` no debe depender del estado. */
  const transportRef = useRef<LiveTransport>("fallback");

  const poll = useCallback(async () => {
    // Sin proyecto ni investigación no hay nada real que consultar: no se
    // llama al endpoint (antes se hacía sin projectId y podía acabar en 500).
    if (!projectId && !investigationId) return;
    // Pestaña oculta: no quemar batería/red; al volver, el intervalo retoma.
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const params = new URLSearchParams();
      if (projectId) params.set("projectId", projectId);
      if (investigationId) params.set("investigationId", investigationId);
      const qs = params.toString();
      const url = "/api/intelligence/live" + (qs ? "?" + qs : "");
      const res = await fetch(url);
      if (!res.ok) { if (mountedRef.current) setMetrics(p => ({ ...p, connected: false })); return; }
      const data = await res.json();
      if (!data.success) { if (mountedRef.current) setMetrics(p => ({ ...p, connected: false })); return; }
      if (!mountedRef.current) return;
      const snapshotEvents: number = data.events.total;
      const snapshotLastEvent: string | null =
        data.events.latest.length > 0 ? data.events.latest[0].created_at : null;
      setMetrics(p => ({
        ...p,
        connected: true,
        lastCheckTimestamp: data.ts,
        uptimePercent: data.uptime.uptimePercent ?? p.uptimePercent,
        avgLatencyMs: data.uptime.avgLatencyMs ?? p.avgLatencyMs,
        criticalFindingsCount: data.findings.critical,
        highFindingsCount: data.findings.high,
        // El snapshot es un absoluto y el contador local puede ir por delante: si
        // Realtime ya contó eventos que el snapshot todavía no incluye, asignar el
        // total haría retroceder la cifra. Se toma el máximo y el timestamp más
        // reciente de los dos.
        eventsCount: Math.max(p.eventsCount, snapshotEvents),
        lastEventTimestamp: masReciente(p.lastEventTimestamp, snapshotLastEvent),
      }));
    } catch { if (mountedRef.current) setMetrics(p => ({ ...p, connected: false })); }
  }, [projectId, investigationId]);

  useEffect(() => {
    mountedRef.current = true;
    // Snapshot inicial siempre: sin él la barra nace vacía aunque entre Realtime
    // después, y el primer cambio del usuario la vería en blanco.
    poll();

    const flagOn = isFlagEnabled("realtimeLive");

    // Sin flag, o sin investigación activa, no hay nada a lo que suscribirse:
    // la tabla no tiene project_id, así que sin investigation_id no hay filtro
    // posible. En ambos casos el único camino es el sondeo.
    if (!flagOn || !investigationId) {
      transportRef.current = "fallback";
      setMetrics(p => ({ ...p, transport: "fallback" }));
      intervalRef.current = setInterval(poll, FALLBACK_MS);
      return () => {
        mountedRef.current = false;
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      };
    }

    /** Convierte el fallo o el silencio del canal en el sondeo de respaldo. */
    const degrade = () => {
      if (!mountedRef.current) return;
      transportRef.current = "fallback";
      setMetrics(p => ({ ...p, transport: "fallback", connected: false }));
      if (!intervalRef.current) intervalRef.current = setInterval(poll, FALLBACK_MS);
    };

    /**
     * H-10 (2026-10-20): el cliente Supabase entra vía `await import` — el
     * import estático arrastraba @supabase/ssr + supabase-js (~215 KB raw) al
     * first-load de las rutas que montan la barra (mismo defecto que
     * OverviewTab). Un fallo de carga del chunk degrada a sondeo.
     */
    let removeChannel: (() => void) | null = null;
    let grace: ReturnType<typeof setTimeout> | null = null;

    void (async () => {
      try {
        const { createClient } = await import('@/shared/lib/supabase/client');
        const supabase = createClient();
        if (!mountedRef.current) return;

        const channel = supabase
          // Nombre único por investigación: dos montajes con distinta id no deben
          // compartir topic ni filtro.
          .channel(`live-metrics:${investigationId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "intelligence_run_events",
              // La columna de filtrado es investigation_id; ver la nota 1 de cabecera.
              filter: `investigation_id=eq.${investigationId}`,
            },
            (payload) => {
              const row = payload.new as { investigation_id?: string; created_at?: string };
              // Última línea de defensa multi-tenant (CHANGE-003). Sin `investigation_id`
              // en la fila no se toca el estado: una fila sin ese campo no viene de esta
              // investigación y no se puede demostrar que sí.
              if (row.investigation_id !== investigationId) return;
              if (!mountedRef.current) return;
              setMetrics(p => ({
                ...p,
                connected: true,
                eventsCount: p.eventsCount + 1,
                lastEventTimestamp: masReciente(p.lastEventTimestamp, row.created_at ?? null),
              }));
            }
          )
          .subscribe((status) => {
            if (!mountedRef.current) return;
            if (status === "SUBSCRIBED") {
              transportRef.current = "realtime";
              setMetrics(p => ({ ...p, transport: "realtime", connected: true }));
              return;
            }
            // CHANNEL_ERROR, TIMED_OUT y CLOSED son los tres finales de un canal que no
            // entrega. Los tres degradan: no hay un estado "a medio recibir" en el que
            // suponer que los datos llegan.
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
              degrade();
            }
          });

        // Red de seguridad del silencio: el canal puede quedarse conectando sin emitir
        // ningún estado final, y entonces ni hay datos ni hay sondeo.
        grace = setTimeout(() => {
          if (transportRef.current !== "realtime") degrade();
        }, SUBSCRIBE_GRACE_MS);

        removeChannel = () => { void supabase.removeChannel(channel); };
      } catch {
        degrade();
      }
    })();

    return () => {
      mountedRef.current = false;
      if (grace) clearTimeout(grace);
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      void removeChannel?.();
    };
  }, [poll, investigationId]);

  const esRealtime = metrics.transport === "realtime";
  const pClass = metrics.connected ? "bg-emerald-400 animate-pulse" : "bg-red-400";
  return (
    <div className={"fixed bottom-4 right-4 mb-[env(safe-area-inset-bottom)] z-[60] transition-[width] duration-300 " + (expanded ? "w-72" : "w-auto")}
      onMouseEnter={() => setExpanded(true)} onMouseLeave={() => setExpanded(false)}>
      <div className="bg-card/90 backdrop-blur-md border border-border rounded-xl shadow-2xl overflow-hidden">
        {!expanded && (
          <button onClick={() => setExpanded(true)}
            aria-label={t("title")}
            className="flex items-center space-x-2 px-3 py-2 text-2xs font-mono text-muted-fg hover:text-foreground transition-colors">
            <span className={"w-2 h-2 rounded-full " + pClass} aria-hidden="true" />
            <Activity aria-hidden="true" className="w-3 h-3 text-primary" /> <span>{t("badge")}</span>
          </button>
        )}
        {expanded && (
          <div className="p-3 space-y-2.5 animate-fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className={"w-2 h-2 rounded-full " + pClass} />
                <span className="text-xs font-semibold text-foreground font-mono">{t("title")}</span>
              </div>
              <div className="flex items-center space-x-1">
                {metrics.connected ? <Wifi className="w-3 h-3 text-chartreuse" /> : <WifiOff className="w-3 h-3 text-red-400" />}
                <span className={"text-2xs font-mono " + (metrics.connected ? "text-chartreuse" : "text-red-400")}>
                  {metrics.connected ? t("online") : t("offline")}</span>
              </div>
            </div>
            {/* Fuente activa (REQ-5): sin esto el usuario no puede distinguir
                "actualizado por suscripción" de "actualizado por sondeo", y ambos
                se ven igual mientras funcionen.

                El color del estado degradado es `text-muted-fg`, no un ámbar de la
                paleta Tailwind. Motivo medido sobre `--card`, que es el fondo real de
                la barra, con el umbral de 4.5:1 que la WCAG exige a texto normal
                (aquí son 11 px, y a ese tamaño el contraste se nota más):

                  text-amber-400   ->  8.72:1 oscuro / 1.53:1 claro   NO APTO
                  text-muted-fg    ->  5.46:1 oscuro / 9.16:1 claro   apto
                  text-chartreuse  ->  5.63:1 oscuro / 4.84:1 claro   apto

                El ámbar desaparecía en modo claro. `contrast-guard.mjs` no lo ve
                porque solo evalúa pares de tokens CSS, no las clases de la paleta.
                El estado NO se transmite por color: las etiquetas "Realtime" y
                "Sondeo 15s" ya lo distinguen, y el color solo lo refuerza. */}
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-background/40 px-2 py-1">
              <div className="flex items-center gap-1 min-w-0">
                <Radio aria-hidden="true" className={"w-3 h-3 shrink-0 " + (esRealtime ? "text-chartreuse" : "text-muted-fg")} />
                <span className="text-2xs font-mono uppercase tracking-wider text-muted-fg shrink-0">{t("source")}</span>
              </div>
              <span className={"text-2xs font-mono truncate " + (esRealtime ? "text-chartreuse" : "text-muted-fg")}>
                {esRealtime ? t("realtime") : t("degraded")}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-background/60 rounded-lg p-2 border border-border/50">
                <span className="text-2xs font-mono text-muted-fg uppercase tracking-wider">{t("uptime")}</span>
                <div className="flex items-center space-x-1 mt-0.5">
                  <TrendingUp className="w-3 h-3 text-primary" />
                  <span className="text-xs font-bold text-foreground">{metrics.uptimePercent !== null ? Math.round(metrics.uptimePercent * 100) + "%" : "-"}</span>
                </div>
              </div>
              <div className="bg-background/60 rounded-lg p-2 border border-border/50">
                <span className="text-2xs font-mono text-muted-fg uppercase tracking-wider">{t("latency")}</span>
                <div className="flex items-center space-x-1 mt-0.5">
                  <Clock className="w-3 h-3 text-chartreuse" />
                  <span className="text-xs font-bold text-foreground">{metrics.avgLatencyMs !== null ? metrics.avgLatencyMs + "ms" : "-"}</span>
                </div>
              </div>
              <div className="bg-background/60 rounded-lg p-2 border border-border/50">
                <span className="text-2xs font-mono text-muted-fg uppercase tracking-wider">{t("critical")}</span>
                <div className="flex items-center space-x-1 mt-0.5">
                  <AlertTriangle className="w-3 h-3 text-destructive" />
                  <span className="text-xs font-bold text-foreground">{metrics.criticalFindingsCount}</span>
                </div>
              </div>
              <div className="bg-background/60 rounded-lg p-2 border border-border/50">
                <span className="text-2xs font-mono text-muted-fg uppercase tracking-wider">{t("events")}</span>
                <div className="flex items-center space-x-1 mt-0.5">
                  <Activity className="w-3 h-3 text-blue-400" />
                  <span className="text-xs font-bold text-foreground">{metrics.eventsCount}</span>
                </div>
              </div>
            </div>
            <div className="text-2xs font-mono text-muted-fg text-center pt-1 border-t border-border/30">
              {metrics.lastCheckTimestamp ? t("updated") + formatTime(metrics.lastCheckTimestamp) : t("waiting")}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Devuelve el más reciente de dos ISO. La comparación es por fecha, no por orden de
 * llegada: el snapshot del sondeo y el evento de Realtime llegan en órdenes
 * distintos y el último en llegar no es necesariamente el más nuevo.
 *
 * Se exporta para poder probarla directamente. Su campo de destino,
 * `lastEventTimestamp`, se mantiene en el estado pero no se pinta en la barra, así
 * que ninguna prueba de DOM podría detectarle un defecto; comprobarlo por la vía
 * que de verdad lo ejecuta es lo único que no da una garantía falsa.
 */
export function masReciente(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  // Una cadena ilegible no puede compararse: se cede el paso a la otra, que sí lo es.
  // Empate (mismo instante) devuelve `a`, el valor que ya estaba.
  if (Number.isNaN(ta)) return b;
  if (Number.isNaN(tb)) return a;
  return tb > ta ? b : a;
}