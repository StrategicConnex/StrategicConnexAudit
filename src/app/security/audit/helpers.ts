/**
 * Helper functions for Security Audit module
 */

import type { SecurityEventType } from "./types";

export const EVENT_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  rate_limit_hit:        { label: "Rate Limit Hit",        color: "text-chart-warning border-chart-warning/30 bg-chart-warning/10",        icon: "⚠" },
  open_redirect_attempt: { label: "Open Redirect Attempt", color: "text-destructive border-destructive/30 bg-destructive/10",              icon: "↗" },
  csp_violation:         { label: "CSP Violation",         color: "text-chart-warning border-chart-warning/30 bg-chart-warning/10",     icon: "🔒" },
  auth_failure:          { label: "Auth Failure",          color: "text-destructive border-destructive/30 bg-destructive/10",           icon: "✗" },
  auth_success:          { label: "Auth Success",          color: "text-chartreuse border-chartreuse/30 bg-chartreuse/10",  icon: "✓" },
  rate_limit_bypass:     { label: "Rate Limit Bypass",     color: "text-accent-purple border-accent-purple/30 bg-accent-purple/10",     icon: "⚡" },
  invalid_input:         { label: "Invalid Input",         color: "text-chart-warning border-chart-warning/30 bg-chart-warning/10",    icon: "⛔" },
};

export const SEVERITY_COLORS: Record<string, { label: string; color: string; icon: string }> = {
  critical: { label: "Crítico", color: "text-destructive border-destructive/30 bg-destructive/10", icon: "🔴" },
  high:     { label: "Alto",     color: "text-chart-warning border-chart-warning/30 bg-chart-warning/10", icon: "🟠" },
  medium:   { label: "Medio",   color: "text-accent-purple border-accent-purple/30 bg-accent-purple/10", icon: "🟡" },
  low:      { label: "Bajo",    color: "text-chartreuse border-chartreuse/30 bg-chartreuse/10", icon: "🟢" },
  info:     { label: "Info",    color: "text-muted-fg border-border bg-surface-muted", icon: "ℹ️" },
};

export const TARGET_BADGES: Record<string, { label: string; color: string }> = {
  authentication: { label: "Auth", color: "bg-accent-purple/10 text-accent-purple border-accent-purple/30" },
  api:            { label: "API",   color: "bg-chart-warning/10 text-chart-warning border-chart-warning/30" },
  webhook:        { label: "Webhook", color: "bg-chartreuse/10 text-chartreuse border-chartreuse/30" },
  cron:           { label: "Cron",  color: "bg-muted-fg/10 text-muted-fg border-border" },
};

export const TARGET_ICONS: Record<string, string> = {
  authentication: "🔐",
  api: "🌐",
  webhook: "🔔",
  cron: "⏰",
};

export const CHANGE_TYPE_COLORS: Record<string, { label: string; color: string }> = {
  registrar:    { label: "Registrar",    color: "bg-accent-purple/10 text-accent-purple" },
  nameservers:  { label: "Nameservers",  color: "bg-chart-warning/10 text-chart-warning" },
  dnssec:       { label: "DNSSEC",       color: "bg-destructive/10 text-destructive" },
  status:       { label: "Status",       color: "bg-chartreuse/10 text-chartreuse" },
  other:        { label: "Otro",         color: "bg-muted-fg/10 text-muted-fg" },
};

export function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-ES", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch { return iso; }
}

export function timeAgo(iso: string): string {
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

export function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
