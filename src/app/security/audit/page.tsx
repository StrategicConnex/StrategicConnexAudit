"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type SecurityEventType =
  | "rate_limit_hit"
  | "open_redirect_attempt"
  | "csp_violation"
  | "auth_failure"
  | "auth_success"
  | "rate_limit_bypass"
  | "invalid_input";

interface AuditLogEntry {
  id: string;
  eventType: SecurityEventType;
  ip: string;
  userId: string | null;
  path: string;
  method: string;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface ApiResponse {
  success: boolean;
  logs: AuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
  eventTypes: string[];
  error?: string;
}

// ─── SIEM Alert Log Types (tabla independiente) ───────────────────────────────

interface SiemAlertEntry {
  id: string;
  ruleEventType: string;
  ip: string;
  severity: string;
  label: string;
  count: number;
  windowMinutes: number;
  target: string;
  status: "success" | "failed";
  responseCode: number | null;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
  detectedAt: string;
  createdAt: string;
}

interface SiemAlertsApiResponse {
  success: boolean;
  alerts: SiemAlertEntry[];
  total: number;
  limit: number;
  offset: number;
  ruleTypes: string[];
  severities: string[];
  breakdown: { success: number; failed: number };
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EVENT_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  rate_limit_hit:       { label: "Rate Limit Hit",        color: "text-amber-400 border-amber-500/30 bg-amber-500/10",        icon: "⚠" },
  open_redirect_attempt:{ label: "Open Redirect Attempt", color: "text-red-400 border-red-500/30 bg-red-500/10",              icon: "↗" },
  csp_violation:        { label: "CSP Violation",         color: "text-orange-400 border-orange-500/30 bg-orange-500/10",     icon: "🔒" },
  auth_failure:         { label: "Auth Failure",          color: "text-rose-400 border-rose-500/30 bg-rose-500/10",           icon: "✗" },
  auth_success:         { label: "Auth Success",          color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",  icon: "✓" },
  rate_limit_bypass:    { label: "Rate Limit Bypass",     color: "text-purple-400 border-purple-500/30 bg-purple-500/10",     icon: "⚡" },
  invalid_input:        { label: "Invalid Input",         color: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",    icon: "⛔" },
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-ES", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch { return iso; }
}

function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "ahora";
    if (mins < 60) return `hace ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `hace ${days}d`;
  } catch { return ""; }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

function Filters({
  eventTypes, filters, onChange,
}: {
  eventTypes: string[];
  filters: { eventType: string; ip: string; from: string; to: string };
  onChange: (f: typeof filters) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div className="flex flex-col gap-1 min-w-40">
        <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Tipo de Evento</label>
        <select
          value={filters.eventType}
          onChange={e => onChange({ ...filters, eventType: e.target.value })}
          className="bg-zinc-900/80 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 
                     focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50
                     transition-all duration-150 cursor-pointer"
        >
          <option value="all">Todos</option>
          {eventTypes.map(t => (
            <option key={t} value={t}>{EVENT_LABELS[t]?.label || t}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1 min-w-36">
        <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">IP</label>
        <input
          type="text"
          placeholder="Filtrar por IP…"
          value={filters.ip}
          onChange={e => onChange({ ...filters, ip: e.target.value })}
          className="bg-zinc-900/80 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600
                     focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50
                     transition-all duration-150"
        />
      </div>
      <div className="flex flex-col gap-1 min-w-32">
        <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Desde</label>
        <input
          type="date"
          value={filters.from}
          max={today}
          onChange={e => onChange({ ...filters, from: e.target.value })}
          className="bg-zinc-900/80 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200
                     focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50
                     transition-all duration-150"
        />
      </div>
      <div className="flex flex-col gap-1 min-w-32">
        <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Hasta</label>
        <input
          type="date"
          value={filters.to}
          max={today}
          onChange={e => onChange({ ...filters, to: e.target.value })}
          className="bg-zinc-900/80 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-200
                     focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50
                     transition-all duration-150"
        />
      </div>
      {(filters.eventType !== "all" || filters.ip || filters.from || filters.to) && (
        <button
          onClick={() => onChange({ eventType: "all", ip: "", from: "", to: "" })}
          className="px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 transition-colors duration-150
                     border border-zinc-800 hover:border-zinc-700 rounded-md"
        >
          Limpiar
        </button>
      )}
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function EventRow({ entry, isExpanded, onToggle }: {
  entry: AuditLogEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const meta = EVENT_LABELS[entry.eventType] || EVENT_LABELS.invalid_input;
  const metadataKeys = Object.keys(entry.metadata);
  const hasMetadata = metadataKeys.length > 0;

  return (
    <>
      <tr
        onClick={hasMetadata ? onToggle : undefined}
        className={`group border-b border-zinc-800/50 transition-colors duration-100
          ${isExpanded ? "bg-zinc-800/40" : "hover:bg-zinc-800/20"}
          ${hasMetadata ? "cursor-pointer" : ""}`}
      >
        <td className="py-3 px-4">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${meta.color}`}>
            <span className="text-[13px]">{meta.icon}</span>
            {meta.label}
          </span>
        </td>
        <td className="py-3 px-4 font-mono text-xs text-zinc-300">{entry.ip}</td>
        <td className="py-3 px-4">
          <span className="font-mono text-[11px] text-zinc-500 bg-zinc-800/60 px-2 py-0.5 rounded">
            {entry.method}
          </span>
          <span className="ml-2 text-xs text-zinc-400">{truncate(entry.path, 40)}</span>
        </td>
        <td className="py-3 px-4 text-xs text-zinc-500 font-mono whitespace-nowrap">
          <span title={formatDate(entry.createdAt)}>{timeAgo(entry.createdAt)}</span>
        </td>
        <td className="py-3 px-4 text-right text-xs text-zinc-600">
          {hasMetadata && (
            <span className={`inline-block transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}>
              ▼
            </span>
          )}
        </td>
      </tr>
      {isExpanded && hasMetadata && (
        <tr className="bg-zinc-900/40 border-b border-zinc-800/30">
          <td colSpan={5} className="py-4 px-8">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {metadataKeys.map(k => {
                const v = entry.metadata[k];
                return (
                  <div key={k} className="bg-zinc-900/60 rounded-md px-3 py-2 border border-zinc-800/40">
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">{k}</div>
                    <div className="text-xs text-zinc-300 font-mono break-all">
                      {typeof v === "object" ? JSON.stringify(v) : String(v)}
                    </div>
                  </div>
                );
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ logs, total }: { logs: AuditLogEntry[]; total: number }) {
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of logs) {
      map.set(l.eventType, (map.get(l.eventType) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [logs]);

  return (
    <div className="flex items-center gap-4 text-xs text-zinc-400 flex-wrap">
      <span className="text-zinc-500 font-semibold">
        {total} evento{total !== 1 ? "s" : ""}
      </span>
      <span className="text-zinc-700">|</span>
      {counts.slice(0, 5).map(([type, count]) => {
        const m = EVENT_LABELS[type];
        return (
          <span key={type} className="flex items-center gap-1">
            <span className="text-[11px]">{m?.icon || "•"}</span>
            <span className="text-zinc-300">{count}</span>
            <span className="text-zinc-600">{m?.label || type}</span>
          </span>
        );
      })}
      {counts.length > 5 && <span className="text-zinc-600">+{counts.length - 5} más</span>}
    </div>
  );
}

type Tab = "events" | "siem" | "whois" | "dns";

// ─── Tab Header ────────────────────────────────────────────────────────────────

function TabHeader({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="flex gap-1 mb-4 border-b border-zinc-800/60">
      <button
        onClick={() => onChange("events")}
        className={`px-4 py-2.5 text-xs font-medium transition-all duration-150 border-b-2 -mb-[1px] ${
          active === "events"
            ? "text-emerald-400 border-emerald-500"
            : "text-zinc-500 border-transparent hover:text-zinc-300 hover:border-zinc-700"
        }`}
      >
        🛡️ Security Events
      </button>
      <button
        onClick={() => onChange("siem")}
        className={`px-4 py-2.5 text-xs font-medium transition-all duration-150 border-b-2 -mb-[1px] ${
          active === "siem"
            ? "text-emerald-400 border-emerald-500"
            : "text-zinc-500 border-transparent hover:text-zinc-300 hover:border-zinc-700"
        }`}
      >
        📡 SIEM Alerts
      </button>
      <button
        onClick={() => onChange("whois")}
        className={`px-4 py-2.5 text-xs font-medium transition-all duration-150 border-b-2 -mb-[1px] ${
          active === "whois"
            ? "text-emerald-400 border-emerald-500"
            : "text-zinc-500 border-transparent hover:text-zinc-300 hover:border-zinc-700"
        }`}
      >
        🔍 WHOIS Alerts
      </button>
      <button
        onClick={() => onChange("dns")}
        className={`px-4 py-2.5 text-xs font-medium transition-all duration-150 border-b-2 -mb-[1px] ${
          active === "dns"
            ? "text-emerald-400 border-emerald-500"
            : "text-zinc-500 border-transparent hover:text-zinc-300 hover:border-zinc-700"
        }`}
      >
        🌐 DNS Alerts
      </button>
    </div>
  );
}

// ─── SIEM Alert Card (desde siem_alert_logs) ──────────────────────────────────

const SEVERITY_COLORS: Record<string, { label: string; color: string; icon: string }> = {
  critical: { label: "Critical", color: "text-red-400 border-red-500/30 bg-red-500/10", icon: "🔴" },
  warning:  { label: "Warning",  color: "text-amber-400 border-amber-500/30 bg-amber-500/10", icon: "🟡" },
  info:     { label: "Info",     color: "text-blue-400 border-blue-500/30 bg-blue-500/10", icon: "🔵" },
};

const TARGET_BADGES: Record<string, { label: string; color: string }> = {
  Slack:      { label: "Slack",      color: "text-purple-400 border-purple-500/30 bg-purple-500/10" },
  PagerDuty:  { label: "PagerDuty",  color: "text-green-400 border-green-500/30 bg-green-500/10" },
  Splunk:     { label: "Splunk",     color: "text-blue-400 border-blue-500/30 bg-blue-500/10" },
  Email:      { label: "Email",      color: "text-rose-400 border-rose-500/30 bg-rose-500/10" },
};

function SiemCard({ entry }: { entry: SiemAlertEntry }) {
  const isHeartbeat = entry.ruleEventType === "heartbeat";
  const isFailed = entry.status === "failed";

  // Heartbeat has a unique glowing/pulsing style
  if (isHeartbeat) {
    const metadata = entry.metadata ?? {};
    const uptime = (metadata as any).uptime || "—";
    const nodeEnv = (metadata as any).nodeEnv || "—";
    return (
      <div className={`rounded-lg border px-5 py-4 transition-all duration-300 ${
        isFailed
          ? "bg-red-900/10 border-red-800/30"
          : "bg-emerald-950/10 border-emerald-500/20 hover:border-emerald-500/40 hover:bg-emerald-950/15"
      }`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Header row */}
            <div className="flex items-center gap-2.5 mb-2 flex-wrap">
              {/* Animated pulse dot */}
              {!isFailed && (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
              )}
              {isFailed && (
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
              )}
              <span className={`text-sm font-medium ${isFailed ? "text-red-300" : "text-emerald-200"} truncate`}>
                💓 {isFailed ? "Heartbeat Failed" : "Heartbeat OK"}
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                isFailed
                  ? "text-red-400 border-red-500/30 bg-red-500/10"
                  : "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
              }`}>
                {entry.target}
              </span>
              {isFailed ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border text-red-400 border-red-500/30 bg-red-500/10">
                  ✗ Failed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                  ✓ Delivered
                </span>
              )}
            </div>

            {/* Heartbeat details — uptime + env */}
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
              <span className="text-zinc-500">
                Uptime: <span className="text-zinc-300 font-mono">{uptime}</span>
              </span>
              <span className="text-zinc-500">
                Env: <span className="text-zinc-300 font-mono">{nodeEnv}</span>
              </span>
              {entry.responseCode != null && (
                <span className="text-zinc-500">
                  HTTP: <span className={`font-mono ${entry.responseCode >= 400 ? "text-red-400" : "text-emerald-300"}`}>{entry.responseCode}</span>
                </span>
              )}
            </div>

            {/* Error message */}
            {isFailed && entry.errorMessage && (
              <p className="text-xs text-red-400/80 font-mono mt-2 break-all bg-red-950/30 rounded px-2 py-1 border border-red-900/30">
                {entry.errorMessage}
              </p>
            )}
          </div>

          {/* Time */}
          <div className="shrink-0 text-right">
            <p className="text-xs text-zinc-500 font-mono whitespace-nowrap" title={formatDate(entry.createdAt)}>
              {timeAgo(entry.createdAt)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Regular alert card
  const sev = SEVERITY_COLORS[entry.severity] || SEVERITY_COLORS.info;
  const targetBadge = TARGET_BADGES[entry.target] || { label: entry.target, color: "text-zinc-400 border-zinc-600/30 bg-zinc-500/10" };

  return (
    <div className={`rounded-lg border px-5 py-4 transition-colors duration-150 ${
      isFailed
        ? "bg-red-900/10 border-red-800/30 hover:bg-red-900/15"
        : "bg-zinc-900/60 border-zinc-800/50 hover:bg-zinc-900/70"
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center gap-2.5 mb-2 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium border ${sev.color}`}>
              {sev.icon} {sev.label}
            </span>
            <span className="text-sm font-medium text-zinc-100 truncate">
              {entry.label}
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${targetBadge.color}`}>
              {targetBadge.label}
            </span>
            {isFailed && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border text-red-400 border-red-500/30 bg-red-500/10">
                ✗ Failed
              </span>
            )}
            {entry.status === "success" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                ✓ Delivered
              </span>
            )}
          </div>

          {/* Details row */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
            <span className="text-zinc-500">
              Tipo: <span className="text-zinc-300 font-mono">{entry.ruleEventType}</span>
            </span>
            <span className="text-zinc-500">
              Eventos: <span className="text-zinc-300 font-semibold">{entry.count}</span>
            </span>
            <span className="text-zinc-500">
              Ventana: <span className="text-zinc-300">{entry.windowMinutes} min</span>
            </span>
            <span className="text-zinc-500">
              IP: <span className="text-zinc-300 font-mono">{entry.ip}</span>
            </span>
            {entry.responseCode != null && (
              <span className="text-zinc-500">
                HTTP: <span className={`font-mono ${entry.responseCode >= 400 ? "text-red-400" : "text-emerald-300"}`}>{entry.responseCode}</span>
              </span>
            )}
          </div>

          {/* Error message */}
          {isFailed && entry.errorMessage && (
            <p className="text-xs text-red-400/80 font-mono mt-2 break-all bg-red-950/30 rounded px-2 py-1 border border-red-900/30">
              {entry.errorMessage}
            </p>
          )}
        </div>

        {/* Time */}
        <div className="shrink-0 text-right">
          <p className="text-xs text-zinc-500 font-mono whitespace-nowrap" title={formatDate(entry.createdAt)}>
            {timeAgo(entry.createdAt)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Test Webhook Result Types ───────────────────────────────────────────────

interface TestWebhookDetail {
  name: string;
  status: "ok" | "error";
  message: string;
}

interface TestWebhookResponse {
  targetsAttempted: number;
  success: boolean;
  details: TestWebhookDetail[];
  timestamp: string;
}

// ─── WHOIS Alert Metadata Types ──────────────────────────────────────────────

interface WhoisChangeMetadata {
  domain: string;
  field: string;
  label: string;
  severity: string;
  previousValue: string;
  currentValue: string;
  detectedAt: string;
  emoji: string;
}

// ─── DNS Alert Metadata Types ───────────────────────────────────────────────

interface DnsChangeMetadata {
  domain: string;
  recordType: string;
  type: string;
  typeLabel: string;
  severity: string;
  previousValue: string;
  currentValue: string;
  detectedAt: string;
  emoji: string;
  typeEmoji: string;
}

const CHANGE_TYPE_COLORS: Record<string, { label: string; color: string }> = {
  added:   { label: "Añadido", color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
  changed: { label: "Modificado", color: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
  removed: { label: "Eliminado", color: "text-red-400 border-red-500/30 bg-red-500/10" },
};

// ─── DNS Alerts Section ────────────────────────────────────────────────────

function DnsAlertsSection({
  alerts, loading, error,
}: {
  alerts: SiemAlertEntry[];
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 bg-zinc-900/40 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-4 px-5 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-300">
        {error}
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-zinc-600">
        <span className="text-4xl mb-4">🌐</span>
        <p className="text-sm font-medium">No hay alertas DNS registradas</p>
        <p className="text-xs mt-1 text-zinc-700 max-w-md text-center">
          Las alertas de cambios DNS aparecerán aquí cuando el sistema detecte
          modificaciones en registros A, AAAA, MX, NS, TXT u otros tipos
          de los dominios auditados.
        </p>
      </div>
    );
  }

  const totalChanges = alerts.reduce((sum, a) => {
    const meta: any = a.metadata?.metadataSamples;
    return sum + (Array.isArray(meta) ? meta.length : 1);
  }, 0);

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center gap-4 text-xs text-zinc-500 mb-4">
        <span className="text-zinc-400 font-semibold">{alerts.length} alertas</span>
        <span className="text-zinc-700">·</span>
        <span className="text-zinc-500">{totalChanges} cambios detectados</span>
        <span className="text-zinc-700">·</span>
        <span className="text-zinc-500">
          {alerts.filter(a => a.status === "success").length} entregados
        </span>
        {alerts.filter(a => a.status === "failed").length > 0 && (
          <>
            <span className="text-zinc-700">·</span>
            <span className="text-red-400">
              {alerts.filter(a => a.status === "failed").length} fallidos
            </span>
          </>
        )}
      </div>

      {/* Alert cards */}
      {alerts.map(entry => {
        const rawMeta = entry.metadata as Record<string, unknown>;
        const samples: DnsChangeMetadata[] = Array.isArray(rawMeta.metadataSamples) ? rawMeta.metadataSamples as DnsChangeMetadata[] : [];
        const isFailed = entry.status === "failed";
        const domain = entry.ip;

        return (
          <div
            key={entry.id}
            className={`rounded-lg border px-5 py-4 transition-colors duration-150 ${
              isFailed
                ? "bg-red-900/10 border-red-800/30"
                : "bg-zinc-900/60 border-zinc-800/50 hover:bg-zinc-900/70"
            }`}
          >
            {/* Header row */}
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                <span className="text-lg shrink-0">🌐</span>
                <span className="text-sm font-semibold text-zinc-100 font-mono truncate">
                  {domain}
                </span>
                {/* Delivery channel badge */}
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                  entry.target === "Slack"
                    ? "text-purple-400 border-purple-500/30 bg-purple-500/10"
                    : entry.target === "PagerDuty"
                      ? "text-green-400 border-green-500/30 bg-green-500/10"
                      : entry.target === "Splunk"
                        ? "text-blue-400 border-blue-500/30 bg-blue-500/10"
                        : entry.target === "Email"
                          ? "text-rose-400 border-rose-500/30 bg-rose-500/10"
                          : "text-zinc-400 border-zinc-600/30 bg-zinc-500/10"
                }`}>
                  {entry.target === "Slack" ? "💬" : entry.target === "PagerDuty" ? "🚨" : entry.target === "Splunk" ? "📊" : entry.target === "Email" ? "📧" : "🔗"} {entry.target}
                </span>
                {/* Status badge */}
                {isFailed ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border text-red-400 border-red-500/30 bg-red-500/10">
                    ✗ Failed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                    ✓ Delivered
                  </span>
                )}
              </div>
              {/* Time */}
              <div className="shrink-0 text-right">
                <p className="text-xs text-zinc-500 font-mono whitespace-nowrap" title={formatDate(entry.createdAt)}>
                  {timeAgo(entry.createdAt)}
                </p>
              </div>
            </div>

            {/* Changes list */}
            {samples.length > 0 ? (
              <div className="space-y-2 ml-1">
                {samples.map((s, i) => {
                  const ctColor = CHANGE_TYPE_COLORS[s.type];
                  return (
                    <div
                      key={i}
                      className="flex items-start gap-3 bg-zinc-900/40 rounded-lg px-3 py-2.5 border border-zinc-800/30"
                    >
                      <span className="text-base shrink-0 mt-0.5">
                        {s.emoji || "📋"}
                      </span>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wide">
                            {s.recordType}
                          </span>
                          {/* Change type badge */}
                          {ctColor && (
                            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium border ${ctColor.color}`}>
                              {s.typeEmoji || "•"} {ctColor.label}
                            </span>
                          )}
                          {/* Severity badge */}
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium border ${
                            s.severity === "critical"
                              ? "text-red-400 border-red-500/30 bg-red-500/10"
                              : s.severity === "warning"
                                ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
                                : "text-blue-400 border-blue-500/30 bg-blue-500/10"
                          }`}>
                            {s.severity}
                          </span>
                        </div>
                        <DiffBadge prev={s.previousValue} curr={s.currentValue} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-zinc-600 italic ml-1">
                Detalles de cambio no disponibles (datos pre-migración)
              </p>
            )}

            {/* Error message */}
            {isFailed && entry.errorMessage && (
              <p className="text-xs text-red-400/80 font-mono mt-2 break-all bg-red-950/30 rounded px-2 py-1 border border-red-900/30">
                {entry.errorMessage}
              </p>
            )}

            {/* Footer: count + window */}
            <div className="mt-2 flex items-center gap-3 text-[10px] text-zinc-600">
              <span>{entry.count} cambio{entry.count !== 1 ? "s" : ""}</span>
              <span>ventana: {entry.windowMinutes} min</span>
              {entry.responseCode != null && (
                <span>HTTP {entry.responseCode}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Whois Alerts Section ────────────────────────────────────────────────────

function DiffBadge({ prev, curr }: { prev: string; curr: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="font-mono text-red-400 line-through bg-red-950/30 px-2 py-0.5 rounded border border-red-900/30 max-w-[200px] truncate" title={prev}>
        {prev || "(vacío)"}
      </span>
      <span className="text-zinc-600 text-[10px]">→</span>
      <span className="font-mono text-emerald-400 bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-900/30 max-w-[200px] truncate" title={curr}>
        {curr || "(vacío)"}
      </span>
    </div>
  );
}

function WhoisAlertsSection({
  alerts, loading, error,
}: {
  alerts: SiemAlertEntry[];
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 bg-zinc-900/40 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-4 px-5 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-300">
        {error}
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-zinc-600">
        <span className="text-4xl mb-4">🔍</span>
        <p className="text-sm font-medium">No hay alertas WHOIS registradas</p>
        <p className="text-xs mt-1 text-zinc-700 max-w-md text-center">
          Las alertas de cambios WHOIS aparecerán aquí cuando el sistema detecte
          modificaciones en registrador, expiración, nameservers u organización registrante
          de los dominios auditados.
        </p>
      </div>
    );
  }

  const totalChanges = alerts.reduce((sum, a) => {
    const meta: any = a.metadata?.metadataSamples;
    return sum + (Array.isArray(meta) ? meta.length : 1);
  }, 0);

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center gap-4 text-xs text-zinc-500 mb-4">
        <span className="text-zinc-400 font-semibold">{alerts.length} alertas</span>
        <span className="text-zinc-700">·</span>
        <span className="text-zinc-500">{totalChanges} cambios detectados</span>
        <span className="text-zinc-700">·</span>
        <span className="text-zinc-500">
          {alerts.filter(a => a.status === "success").length} entregados
        </span>
        {alerts.filter(a => a.status === "failed").length > 0 && (
          <>
            <span className="text-zinc-700">·</span>
            <span className="text-red-400">
              {alerts.filter(a => a.status === "failed").length} fallidos
            </span>
          </>
        )}
      </div>

      {/* Alert cards */}
      {alerts.map(entry => {
        const rawMeta = entry.metadata as Record<string, unknown>;
        const samples: WhoisChangeMetadata[] = Array.isArray(rawMeta.metadataSamples) ? rawMeta.metadataSamples as WhoisChangeMetadata[] : [];
        const isFailed = entry.status === "failed";
        const domain = entry.ip;

        return (
          <div
            key={entry.id}
            className={`rounded-lg border px-5 py-4 transition-colors duration-150 ${
              isFailed
                ? "bg-red-900/10 border-red-800/30"
                : "bg-zinc-900/60 border-zinc-800/50 hover:bg-zinc-900/70"
            }`}
          >
            {/* Header row */}
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                <span className="text-lg shrink-0">🌐</span>
                <span className="text-sm font-semibold text-zinc-100 font-mono truncate">
                  {domain}
                </span>
                {/* Delivery channel badge */}
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                  entry.target === "Slack"
                    ? "text-purple-400 border-purple-500/30 bg-purple-500/10"
                    : entry.target === "PagerDuty"
                      ? "text-green-400 border-green-500/30 bg-green-500/10"
                      : entry.target === "Splunk"
                        ? "text-blue-400 border-blue-500/30 bg-blue-500/10"
                        : entry.target === "Email"
                          ? "text-rose-400 border-rose-500/30 bg-rose-500/10"
                          : "text-zinc-400 border-zinc-600/30 bg-zinc-500/10"
                }`}>
                  {entry.target === "Slack" ? "💬" : entry.target === "PagerDuty" ? "🚨" : entry.target === "Splunk" ? "📊" : entry.target === "Email" ? "📧" : "🔗"} {entry.target}
                </span>
                {/* Status badge */}
                {isFailed ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border text-red-400 border-red-500/30 bg-red-500/10">
                    ✗ Failed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                    ✓ Delivered
                  </span>
                )}
              </div>
              {/* Time */}
              <div className="shrink-0 text-right">
                <p className="text-xs text-zinc-500 font-mono whitespace-nowrap" title={formatDate(entry.createdAt)}>
                  {timeAgo(entry.createdAt)}
                </p>
              </div>
            </div>

            {/* Changes list */}
            {samples.length > 0 ? (
              <div className="space-y-2 ml-1">
                {samples.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 bg-zinc-900/40 rounded-lg px-3 py-2.5 border border-zinc-800/30"
                  >
                    <span className="text-base shrink-0 mt-0.5">
                      {s.emoji || "📋"}
                    </span>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wide">
                          {s.label}
                        </span>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium border ${
                          s.severity === "critical"
                            ? "text-red-400 border-red-500/30 bg-red-500/10"
                            : s.severity === "warning"
                              ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
                              : "text-blue-400 border-blue-500/30 bg-blue-500/10"
                        }`}>
                          {s.severity}
                        </span>
                      </div>
                      <DiffBadge prev={s.previousValue} curr={s.currentValue} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-600 italic ml-1">
                Detalles de cambio no disponibles (datos pre-migración)
              </p>
            )}

            {/* Error message */}
            {isFailed && entry.errorMessage && (
              <p className="text-xs text-red-400/80 font-mono mt-2 break-all bg-red-950/30 rounded px-2 py-1 border border-red-900/30">
                {entry.errorMessage}
              </p>
            )}

            {/* Footer: count + window */}
            <div className="mt-2 flex items-center gap-3 text-[10px] text-zinc-600">
              <span>{entry.count} cambio{entry.count !== 1 ? "s" : ""}</span>
              <span>ventana: {entry.windowMinutes} min</span>
              {entry.responseCode != null && (
                <span>HTTP {entry.responseCode}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── SIEM Webhook Test Toast ──────────────────────────────────────────────────

const TARGET_ICONS: Record<string, string> = {
  Slack: "💬",
  PagerDuty: "🚨",
  Splunk: "📊",
};

function TestToast({ result, onDismiss }: { result: TestWebhookResponse; onDismiss: () => void }) {
  const errorCount = result.details.filter(d => d.status === "error").length;
  const allOk = errorCount === 0;

  return (
    <div className={`fixed top-6 right-6 z-50 w-96 max-w-[calc(100vw-2rem)] rounded-xl border shadow-2xl 
      ${allOk ? "bg-zinc-900 border-emerald-500/30" : "bg-zinc-900 border-red-500/30"} 
      animate-in slide-in-from-right-4 duration-300`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800/60">
        <div className="flex items-center gap-2">
          <span className="text-lg">{allOk ? "✅" : "⚠️"}</span>
          <span className="text-sm font-medium text-zinc-100">Webhook Test</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-zinc-500">
            {result.targetsAttempted} target{result.targetsAttempted !== 1 ? "s" : ""}
            {!allOk && <span className="text-red-400 ml-1">({errorCount} fail{errorCount !== 1 ? "s" : ""})</span>}
          </span>
          <button
            onClick={onDismiss}
            className="text-zinc-600 hover:text-zinc-300 transition-colors text-sm leading-none"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Details */}
      <div className="px-5 py-3 space-y-2">
        {result.details.map(d => (
          <div
            key={d.name}
            className={`flex items-start gap-3 rounded-lg px-3 py-2.5 text-xs border ${
              d.status === "ok"
                ? "bg-emerald-500/5 border-emerald-500/20"
                : "bg-red-500/5 border-red-500/20"
            }`}
          >
            <span className="text-base shrink-0 mt-0.5">{TARGET_ICONS[d.name] || "🔗"}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-semibold text-zinc-200">{d.name}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  d.status === "ok"
                    ? "text-emerald-400 bg-emerald-500/10"
                    : "text-red-400 bg-red-500/10"
                }`}>
                  {d.status === "ok" ? "✓ OK" : "✗ FAIL"}
                </span>
              </div>
              <p className="text-zinc-500 font-mono break-all">{d.message}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Timestamp */}
      <div className="px-5 py-2 border-t border-zinc-800/40">
        <p className="text-[10px] text-zinc-700 font-mono">
          {new Date(result.timestamp).toLocaleTimeString("es-ES")}
        </p>
      </div>
    </div>
  );
}

// ─── SIEM Section ──────────────────────────────────────────────────────────────

function SiemSection({
  alerts, loading, error, breakdown,
}: {
  alerts: SiemAlertEntry[];
  loading: boolean;
  error: string | null;
  breakdown: { success: number; failed: number };
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestWebhookResponse | null>(null);

  const handleTestWebhooks = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/security/siem/test");
      const data: TestWebhookResponse & { error?: string } = await res.json();
      if (!res.ok || data.error) {
        setTestResult({
          targetsAttempted: 0,
          success: false,
          details: [{ name: "Error", status: "error", message: data.error || `HTTP ${res.status}` }],
          timestamp: new Date().toISOString(),
        });
      } else {
        setTestResult(data);
      }
    } catch {
      setTestResult({
        targetsAttempted: 0,
        success: false,
        details: [{ name: "Error", status: "error", message: "Error de conexión" }],
        timestamp: new Date().toISOString(),
      });
    } finally {
      setTesting(false);
    }
  }, []);

  // Common test button
  const testButton = (
    <button
      onClick={handleTestWebhooks}
      disabled={testing}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium 
                 text-zinc-300 bg-zinc-900/80 border border-zinc-800 
                 rounded-md hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-50
                 transition-all duration-150 active:scale-[0.97]"
    >
      {testing ? (
        <>
          <span className="inline-block w-3 h-3 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
          Probando…
        </>
      ) : (
        <>
          <span>🧪</span>
          Test Webhooks
        </>
      )}
    </button>
  );

  // Toast
  const toast = testResult && (
    <TestToast result={testResult} onDismiss={() => setTestResult(null)} />
  );

  if (loading) {
    return (
      <>
        {toast}
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-zinc-900/40 rounded-lg animate-pulse" />
          ))}
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        {toast}
        <div className="mb-4 px-5 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-300">
          {error}
        </div>
      </>
    );
  }

  if (alerts.length === 0) {
    return (
      <>
        {toast}
        <div className="flex flex-col items-center justify-center py-24 text-zinc-600">
          <span className="text-4xl mb-4">📡</span>
          <p className="text-sm font-medium">No hay alertas SIEM registradas</p>
          <p className="text-xs mt-1 text-zinc-700 max-w-md text-center">
            Las alertas aparecerán aquí cuando el SIEM exporter detecte patrones sospechosos
            y envíe notificaciones a los webhooks configurados.
            Los datos se persisten en la tabla <span className="font-mono text-zinc-500">siem_alert_logs</span>.
          </p>
          <div className="mt-6">{testButton}</div>
        </div>
      </>
    );
  }

  return (
    <>
      {toast}
      <div className="space-y-3">
        {/* Summary bar + test button */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <span className="text-zinc-400 font-semibold">{alerts.length} envíos</span>
            {breakdown.success > 0 && (
              <span className="text-emerald-400">{breakdown.success} entregados</span>
            )}
            {breakdown.failed > 0 && (
              <span className="text-red-400">{breakdown.failed} fallidos</span>
            )}
          </div>
          {testButton}
        </div>

        {/* Alert cards */}
        {alerts.map(entry => (
          <SiemCard key={entry.id} entry={entry} />
        ))}
      </div>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SecurityAuditDashboard() {
  const [tab, setTab] = useState<Tab>("events");
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filters, setFilters] = useState({ eventType: "all", ip: "", from: "", to: "" });
  const [autoRefresh, setAutoRefresh] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ─── SIEM tab state (from siem_alert_logs) ─────────────────────────────────
  const [siemAlerts, setSiemAlerts] = useState<SiemAlertEntry[]>([]);
  const [siemBreakdown, setSiemBreakdown] = useState<{ success: number; failed: number }>({ success: 0, failed: 0 });
  // ─── WHOIS tab state (filtered siem_alert_logs) ────────────────────────────
  const [whoisAlerts, setWhoisAlerts] = useState<SiemAlertEntry[]>([]);
  // ─── DNS tab state (filtered siem_alert_logs) ─────────────────────────────
  const [dnsAlerts, setDnsAlerts] = useState<SiemAlertEntry[]>([]);

  const fetchLogs = useCallback(async (f: typeof filters, activeTab?: Tab) => {
    const t = activeTab ?? tab;
    setLoading(true);
    setError(null);
    try {
      if (t === "siem") {
        // 🔄 SIEM tab: consulta tabla independiente siem_alert_logs
        const params = new URLSearchParams();
        if (f.ip) params.set("ip", f.ip);
        if (f.from) params.set("from", f.from);
        if (f.to) params.set("to", f.to);
        params.set("limit", "100");

        const res = await fetch(`/api/security/siem-alerts?${params}`);
        const data: SiemAlertsApiResponse = await res.json();
        if (!data.success) {
          setError(data.error || "Error al cargar");
        } else {
          setSiemAlerts(data.alerts);
          setSiemBreakdown(data.breakdown);
        }
      } else if (t === "whois") {
        // 🔍 WHOIS tab: filtrado por whois_change_detected
        const params = new URLSearchParams();
        params.set("ruleEventType", "whois_change_detected");
        if (f.ip) params.set("ip", f.ip);
        if (f.from) params.set("from", f.from);
        if (f.to) params.set("to", f.to);
        params.set("limit", "100");

        const res = await fetch(`/api/security/siem-alerts?${params}`);
        const data: SiemAlertsApiResponse = await res.json();
        if (!data.success) {
          setError(data.error || "Error al cargar");
        } else {
          setWhoisAlerts(data.alerts);
        }
      } else if (t === "dns") {
        // 🌐 DNS tab: filtrado por dns_change_detected
        const params = new URLSearchParams();
        params.set("ruleEventType", "dns_change_detected");
        if (f.ip) params.set("ip", f.ip);
        if (f.from) params.set("from", f.from);
        if (f.to) params.set("to", f.to);
        params.set("limit", "100");

        const res = await fetch(`/api/security/siem-alerts?${params}`);
        const data: SiemAlertsApiResponse = await res.json();
        if (!data.success) {
          setError(data.error || "Error al cargar");
        } else {
          setDnsAlerts(data.alerts);
        }
      } else {
        // 🛡️ Events tab: consulta security_audit_logs
        const params = new URLSearchParams();
        if (f.eventType !== "all") params.set("eventType", f.eventType);
        if (f.ip) params.set("ip", f.ip);
        if (f.from) params.set("from", f.from);
        if (f.to) params.set("to", f.to);
        params.set("limit", "100");

        const res = await fetch(`/api/security/audit-logs?${params}`);
        const data: ApiResponse = await res.json();
        if (!data.success) {
          setError(data.error || "Error al cargar");
        } else {
          setLogs(data.logs);
          setTotal(data.total);
          if (data.eventTypes.length > 0) setEventTypes(data.eventTypes);
        }
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleTabChange = useCallback((t: Tab) => {
    setTab(t);
    setExpandedId(null);
    fetchLogs(filters, t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tab no se usa en el cuerpo del callback
  }, [fetchLogs, filters]);

  // Initial load
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect -- Mount once pattern
  useEffect(() => { fetchLogs(filters, tab); }, []);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => fetchLogs(filters, tab), 15000);
    return () => clearInterval(interval);
  }, [autoRefresh, filters, tab, fetchLogs]);

  const handleFilterChange = useCallback((f: typeof filters) => {
    setFilters(f);
    setExpandedId(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const isIpOnlyChange = f.ip !== filters.ip && f.eventType === filters.eventType && f.from === filters.from && f.to === filters.to;
    if (isIpOnlyChange && f.ip) {
      debounceRef.current = setTimeout(() => fetchLogs(f, tab), 300);
      return;
    }
    fetchLogs(f, tab);
  }, [fetchLogs, filters, tab]);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 selection:bg-emerald-500/20">
      {/* Header */}
      <header className="border-b border-zinc-800/60 bg-[#070707]">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-zinc-100">
                🛡️ Security Operations
              </h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                Monitoreo de seguridad en tiempo real — eventos estructurados y alertas SIEM
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-zinc-500 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={e => setAutoRefresh(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 
                             focus:ring-emerald-500/30 focus:ring-offset-0
                             accent-emerald-500"
                />
                Auto-refresh (15s)
              </label>
              <button
                onClick={() => fetchLogs(filters, tab)}
                disabled={loading}
                className="px-4 py-2 text-xs font-medium text-zinc-300 bg-zinc-900/80 border border-zinc-800 
                           rounded-md hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-50 
                           transition-all duration-150 active:scale-[0.97]"
              >
                {loading ? "Cargando…" : "↻ Refresh"}
              </button>
            </div>
          </div>
          <Filters eventTypes={eventTypes} filters={filters} onChange={handleFilterChange} />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        <TabHeader active={tab} onChange={handleTabChange} />

        {/* Security Events Tab */}
        {tab === "events" && (
          <>
            {/* Stats */}
            {!loading && logs.length > 0 && (
              <div className="mb-4 px-1">
                <StatsBar logs={logs} total={total} />
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mb-4 px-5 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-300">
                {error}
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-14 bg-zinc-900/40 rounded-lg animate-pulse" />
                ))}
              </div>
            )}

            {/* Empty */}
            {!loading && !error && logs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 text-zinc-600">
                <span className="text-4xl mb-4">📭</span>
                <p className="text-sm font-medium">No hay eventos de seguridad registrados</p>
                <p className="text-xs mt-1 text-zinc-700">
                  Los eventos aparecerán aquí cuando ocurran rate limits, CSP violations u otros eventos de seguridad
                </p>
              </div>
            )}

            {/* Table */}
            {!loading && logs.length > 0 && (
              <div className="border border-zinc-800/60 rounded-xl overflow-hidden bg-[#080808]">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-800/60 text-[10px] uppercase tracking-widest text-zinc-600 font-semibold">
                      <th className="text-left py-3 px-4 w-44">Evento</th>
                      <th className="text-left py-3 px-4 w-36">IP</th>
                      <th className="text-left py-3 px-4">Ruta</th>
                      <th className="text-left py-3 px-4 w-28">Tiempo</th>
                      <th className="py-3 px-4 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(entry => (
                      <EventRow
                        key={entry.id}
                        entry={entry}
                        isExpanded={expandedId === entry.id}
                        onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Footer */}
            {!loading && logs.length > 0 && (
              <div className="mt-4 text-center text-[10px] text-zinc-700">
                Mostrando {logs.length} de {total} eventos
              </div>
            )}
          </>
        )}

        {/* SIEM Alerts Tab */}
        {tab === "siem" && (
          <SiemSection alerts={siemAlerts} loading={loading} error={error} breakdown={siemBreakdown} />
        )}

        {/* WHOIS Alerts Tab */}
        {tab === "whois" && (
          <WhoisAlertsSection alerts={whoisAlerts} loading={loading} error={error} />
        )}

        {/* DNS Alerts Tab */}
        {tab === "dns" && (
          <DnsAlertsSection alerts={dnsAlerts} loading={loading} error={error} />
        )}
      </main>
    </div>
  );
}
