"use client";

import Link from "next/link";
import { ShieldAlert, ShieldCheck, LockKeyhole } from "lucide-react";
import { SkeletonList } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageShellBar } from "@/components/ui/PageShell";
import type { AuditLogEntry, SiemAlertEntry, Tab } from "./types";
import { EVENT_LABELS, formatDate, timeAgo, truncate } from "./helpers";
import { useSecurityAudit } from "./hooks/use-security-audit";

// ─── Sub-components (extracted from inline, same file for co-location) ─────

function UnauthorizedPanel() {
  return (
    <div className="mb-4 px-5 py-8 border border-border rounded-xl flex flex-col items-center text-center gap-2 bg-card">
      <LockKeyhole aria-hidden="true" className="w-5 h-5 text-muted-fg" />
      <p className="text-sm font-bold text-foreground">Esta sección vive tras tu sesión</p>
      <p className="text-xs text-muted-fg max-w-sm">Inicia sesión para ver eventos de seguridad y alertas SIEM.</p>
      <Link
        href="/login"
        className="mt-2 text-2xs font-bold uppercase tracking-widest text-primary transition-colors inline-flex items-center gap-1.5 px-4 py-2 rounded-md border bg-primary/8 border-primary/15"
      >
        Iniciar sesión
      </Link>
    </div>
  );
}

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
        <label className="text-2xs uppercase tracking-widest text-muted-foreground font-semibold">Tipo de Evento</label>
        <select
          value={filters.eventType}
          onChange={e => onChange({ ...filters, eventType: e.target.value })}
          className="bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-chart-success/50 focus:border-chartreuse/50 transition-all duration-150 cursor-pointer"
        >
          <option value="all">Todos</option>
          {eventTypes.map(t => (
            <option key={t} value={t}>{EVENT_LABELS[t]?.label || t}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1 min-w-36">
        <label className="text-2xs uppercase tracking-widest text-muted-foreground font-semibold">IP</label>
        <input
          type="text"
          placeholder="Filtrar por IP…"
          value={filters.ip}
          onChange={e => onChange({ ...filters, ip: e.target.value })}
          className="bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-chart-success/50 focus:border-chartreuse/50 transition-all duration-150"
        />
      </div>
      <div className="flex flex-col gap-1 min-w-32">
        <label className="text-2xs uppercase tracking-widest text-muted-foreground font-semibold">Desde</label>
        <input
          type="date"
          value={filters.from}
          max={today}
          onChange={e => onChange({ ...filters, from: e.target.value })}
          className="bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-chart-success/50 focus:border-chartreuse/50 transition-all duration-150"
        />
      </div>
      <div className="flex flex-col gap-1 min-w-32">
        <label className="text-2xs uppercase tracking-widest text-muted-foreground font-semibold">Hasta</label>
        <input
          type="date"
          value={filters.to}
          max={today}
          onChange={e => onChange({ ...filters, to: e.target.value })}
          className="bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-chart-success/50 focus:border-chartreuse/50 transition-all duration-150"
        />
      </div>
      {(filters.eventType !== "all" || filters.ip || filters.from || filters.to) && (
        <button
          onClick={() => onChange({ eventType: "all", ip: "", from: "", to: "" })}
          className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors duration-150 border border-border hover:border-foreground/20 rounded-md"
        >
          Limpiar
        </button>
      )}
    </div>
  );
}

function EventRow({ entry, isExpanded, onToggle }: {
  entry: AuditLogEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const meta = entry.metadata as Record<string, unknown> | undefined;
  const label = EVENT_LABELS[entry.eventType]?.label || entry.eventType;
  const color = EVENT_LABELS[entry.eventType]?.color || "text-muted-foreground";

  return (
    <tr className="border-b border-border/50 hover:bg-surface-muted/50 transition-colors">
      <td className="py-3 px-4">
        <span className={`text-xs font-semibold ${color}`}>{label}</span>
      </td>
      <td className="py-3 px-4">
        <span className="text-xs font-mono text-muted-foreground">{entry.ip || "—"}</span>
      </td>
      <td className="py-3 px-4">
        <span className="text-xs text-muted-foreground">{truncate(entry.path || "—", 40)}</span>
      </td>
      <td className="py-3 px-4">
        <span className="text-xs text-muted-foreground" title={formatDate(entry.createdAt)}>
          {timeAgo(entry.createdAt)}
        </span>
      </td>
      <td className="py-3 px-4 text-center">
        <button onClick={onToggle} className="text-muted-foreground hover:text-foreground transition-colors text-xs">
          {isExpanded ? "▼" : "▶"}
        </button>
      </td>
      {isExpanded && (
        <tr>
          <td colSpan={5} className="px-4 pb-3">
            <div className="bg-surface-muted rounded-lg p-3 text-xs text-muted-foreground font-mono whitespace-pre-wrap">
              {meta ? JSON.stringify(meta, null, 2) : "Sin metadatos"}
            </div>
          </td>
        </tr>
      )}
    </tr>
  );
}

function StatsBar({ logs, total }: { logs: AuditLogEntry[]; total: number }) {
  const byType = logs.reduce<Record<string, number>>((acc, l) => {
    acc[l.eventType] = (acc[l.eventType] || 0) + 1;
    return acc;
  }, {});
  const top = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="flex flex-wrap gap-3">
      {top.map(([action, count]) => (
        <div key={action} className="px-3 py-1.5 bg-surface-muted border border-border rounded-lg">
          <span className="text-2xs font-semibold text-muted-foreground">
            {EVENT_LABELS[action]?.label || action}: {count}
          </span>
        </div>
      ))}
      <div className="px-3 py-1.5 bg-surface-muted border border-border rounded-lg">
        <span className="text-2xs font-semibold text-primary">Total: {total}</span>
      </div>
    </div>
  );
}

function TabHeader({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "events", label: "Eventos", icon: "🛡️" },
    { id: "siem", label: "SIEM", icon: "🔔" },
    { id: "whois", label: "WHOIS", icon: "🔍" },
    { id: "dns", label: "DNS", icon: "🌐" },
  ];

  return (
    <div className="flex gap-1 mb-6 border-b border-border">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-widest transition-colors border-b-2 ${
            active === t.id
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.icon} {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── SIEM / WHOIS / DNS sections (kept inline for co-location) ──────────────

const SEVERITY_COLORS: Record<string, { label: string; color: string; icon: string }> = {
  critical: { label: "Crítico", color: "text-red-400 bg-red-500/10 border-red-500/20", icon: "🔴" },
  high: { label: "Alto", color: "text-orange-400 bg-orange-500/10 border-orange-500/20", icon: "🟠" },
  medium: { label: "Medio", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20", icon: "🟡" },
  low: { label: "Bajo", color: "text-blue-400 bg-blue-500/10 border-blue-500/20", icon: "🔵" },
};

function SiemCard({ entry }: { entry: SiemAlertEntry }) {
  const sev = SEVERITY_COLORS[entry.severity] ?? { label: entry.severity, color: 'text-gray-400 bg-gray-500/10 border-gray-500/20', icon: '⚪' };
  return (
    <div className="border border-border rounded-xl p-4 bg-surface hover:bg-surface-muted/50 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 text-2xs font-bold rounded-full border ${sev.color}`}>
              {sev.icon} {sev.label}
            </span>
            <span className="text-2xs text-muted-foreground">{timeAgo(entry.createdAt)}</span>
          </div>
          <p className="text-sm font-semibold text-foreground truncate">{entry.label || entry.ruleEventType}</p>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{entry.errorMessage || entry.target}</p>
        </div>
      </div>
    </div>
  );
}

function SiemSection({ alerts, loading, error, breakdown, unauthorized }: {
  alerts: SiemAlertEntry[];
  loading: boolean;
  error: string | null;
  breakdown: { success: number; failed: number };
  unauthorized: boolean;
}) {
  if (unauthorized) return <UnauthorizedPanel />;
  if (loading) return <SkeletonList count={5} />;
  if (error) return <div className="p-4 text-sm text-destructive">{error}</div>;
  if (alerts.length === 0) return <EmptyState icon={<ShieldAlert />} title="No hay alertas SIEM" description="Las alertas SIEM aparecerán cuando se detecten eventos de seguridad" />;

  return (
    <div>
      <div className="flex gap-3 mb-4">
        <div className="px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-lg text-xs font-semibold text-green-400">
          ✅ Exitosas: {breakdown.success}
        </div>
        <div className="px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs font-semibold text-red-400">
          ❌ Fallidas: {breakdown.failed}
        </div>
      </div>
      <div className="space-y-3">
        {alerts.map(alert => <SiemCard key={alert.id} entry={alert} />)}
      </div>
    </div>
  );
}

function WhoisAlertsSection({ alerts, loading, error, unauthorized }: {
  alerts: SiemAlertEntry[];
  loading: boolean;
  error: string | null;
  unauthorized: boolean;
}) {
  if (unauthorized) return <UnauthorizedPanel />;
  if (loading) return <SkeletonList count={5} />;
  if (error) return <div className="p-4 text-sm text-destructive">{error}</div>;
  if (alerts.length === 0) return <EmptyState icon={<ShieldAlert />} title="No hay cambios WHOIS detectados" description="Los cambios en registros WHOIS aparecerán aquí" />;

  return (
    <div className="space-y-3">
      {alerts.map(alert => <SiemCard key={alert.id} entry={alert} />)}
    </div>
  );
}

function DnsAlertsSection({ alerts, loading, error, unauthorized }: {
  alerts: SiemAlertEntry[];
  loading: boolean;
  error: string | null;
  unauthorized: boolean;
}) {
  if (unauthorized) return <UnauthorizedPanel />;
  if (loading) return <SkeletonList count={5} />;
  if (error) return <div className="p-4 text-sm text-destructive">{error}</div>;
  if (alerts.length === 0) return <EmptyState icon={<ShieldAlert />} title="No hay cambios DNS detectados" description="Los cambios en registros DNS aparecerán aquí" />;

  return (
    <div className="space-y-3">
      {alerts.map(alert => <SiemCard key={alert.id} entry={alert} />)}
    </div>
  );
}

// ─── Main Component (thin orchestrator) ─────────────────────────────────────

export default function SecurityAuditDashboard() {
  const {
    tab, logs, total, eventTypes, loading, error, unauthorized,
    expandedId, filters, autoRefresh,
    siemAlerts, siemBreakdown, whoisAlerts, dnsAlerts,
    setTab, setExpandedId, setAutoRefresh, handleFilterChange, refresh,
  } = useSecurityAudit();

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-chartreuse/20">
      <PageShellBar />
      <header className="border-b border-border bg-surface">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
                <ShieldCheck aria-hidden="true" className="w-5 h-5 text-primary" />
                Operaciones de Seguridad
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Monitoreo de seguridad en tiempo real — eventos estructurados y alertas SIEM
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={e => setAutoRefresh(e.target.checked)}
                  className="rounded border-border bg-popover text-chartreuse focus:ring-chart-success/30 focus:ring-offset-0 accent-chart-success"
                />
                Auto-actualizar (15s)
              </label>
              <button
                onClick={refresh}
                disabled={loading}
                className="px-4 py-2 text-xs font-medium text-foreground bg-card border border-border rounded-md hover:bg-surface-muted hover:text-foreground disabled:opacity-50 transition-all duration-150 active:scale-[0.97]"
              >
                {loading ? "Cargando…" : "↻ Actualizar"}
              </button>
            </div>
          </div>
          <Filters eventTypes={eventTypes} filters={filters} onChange={handleFilterChange} />
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="max-w-7xl mx-auto px-6 py-6">
        <TabHeader active={tab} onChange={setTab} />

        {tab === "events" && (
          <>
            {!loading && logs.length > 0 && (
              <div className="mb-4 px-1"><StatsBar logs={logs} total={total} /></div>
            )}
            {error && !unauthorized && (
              <div className="mb-4 px-5 py-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">{error}</div>
            )}
            {unauthorized && !loading && <UnauthorizedPanel />}
            {loading && <SkeletonList count={8} />}
            {!loading && !error && !unauthorized && logs.length === 0 && (
              <EmptyState icon={<ShieldAlert />} title="No hay eventos de seguridad registrados" description="Los eventos aparecerán aquí cuando ocurran rate limits, CSP violations u otros eventos de seguridad" />
            )}
            {!loading && logs.length > 0 && (
              <div className="border border-border rounded-xl overflow-hidden bg-surface overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr className="border-b border-border text-2xs uppercase tracking-widest text-muted-foreground font-semibold">
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
            {!loading && logs.length > 0 && (
              <div className="mt-4 text-center text-2xs text-muted-foreground">
                Mostrando {logs.length} de {total} eventos
              </div>
            )}
          </>
        )}

        {tab === "siem" && <SiemSection alerts={siemAlerts} loading={loading} error={error} breakdown={siemBreakdown} unauthorized={unauthorized} />}
        {tab === "whois" && <WhoisAlertsSection alerts={whoisAlerts} loading={loading} error={error} unauthorized={unauthorized} />}
        {tab === "dns" && <DnsAlertsSection alerts={dnsAlerts} loading={loading} error={error} unauthorized={unauthorized} />}
      </main>
    </div>
  );
}
