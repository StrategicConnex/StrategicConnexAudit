"use client";

import { useTranslations } from "next-intl";
import { Globe, ClipboardList, Activity, Bell } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ScoreGauge } from "@/components/ui/ScoreGauge";
import { MetricCard } from "@/components/MetricCard";
import { useDashboardUI } from "./dashboard-ui-context";

/**
 * Hero del overview — vive en el `DashboardShell`, FUERA del `<Suspense>`
 * (H-10b F-C).
 *
 * El `h2` (`heroTitle`) es copy fijo sin count: pinta con el shell a
 * ≈ TTFB+CSS y nunca se muta ni se reemplaza, así el LCP queda anclado a ese
 * primer pintado en vez de al `h2` con count que solo existía cuando las
 * queries terminaban. El count vive en la sublínea de badge
 * (`welcomeSummary`), que se rellena in place desde el contexto cuando los
 * paneles hidratan → el nodo no cambia de tamaño y el CLS se queda en ~0.
 *
 * Los valores arrancan en "—" (mismo placeholder honesto del resto del
 * dashboard); uptime/alerts llegan del fetch de telemetría que publica
 * `OverviewTab` vía `publishLive`.
 */
export function HeroSummary() {
  const t = useTranslations("overview");
  const { chrome, live } = useDashboardUI();

  const projectCount = chrome ? chrome.dashboardData.length : null;
  const auditedCount = chrome
    ? chrome.dashboardData.filter((p) => p.latestAudit != null).length
    : null;
  const coverage =
    projectCount != null && auditedCount != null && projectCount > 0
      ? (auditedCount / projectCount) * 100
      : null;
  const uptimePercent = live?.uptimePercent ?? null;
  const checksLoading = live?.checksLoading ?? true;
  const failedChecks = live?.failedChecks ?? 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-2 p-6">
        <p className="text-2xs font-extrabold uppercase tracking-widest text-primary">
          {t("greeting")}
          {chrome?.userInitials ? `, ${chrome.userInitials}` : ""}
        </p>
        {/* h2 fijo (sin count) — el ancla de LCP. No agregar datos vivos aquí. */}
        <h2
          data-testid="hero-title"
          className="font-display text-2xl font-extrabold tracking-tight text-foreground mt-1"
        >
          {t("heroTitle")}
        </h2>
        {/* Sublínea con el count vivo: siempre presente (placeholder "—") para
            que el relleno no desplace el h2 ni mueva el LCP. */}
        <p data-testid="hero-count-badge" className="text-sm text-muted-fg mt-1">
          {chrome ? t("welcomeSummary", { count: projectCount ?? 0 }) : "—"}
        </p>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mt-5">
          <MetricCard
            icon={<Globe aria-hidden="true" />}
            label={t("metricsProjects")}
            value={projectCount != null ? String(projectCount) : "—"}
          />
          <MetricCard
            icon={<ClipboardList aria-hidden="true" />}
            label={t("metricsAudits")}
            value={auditedCount != null ? String(auditedCount) : "—"}
          />
          <MetricCard
            icon={<Activity aria-hidden="true" />}
            label={t("metricsUptime")}
            value={uptimePercent != null ? `${(uptimePercent * 100).toFixed(1)}%` : "—"}
          />
          <MetricCard
            icon={<Bell aria-hidden="true" />}
            label={t("metricsAlerts")}
            value={checksLoading ? "—" : String(failedChecks)}
          />
        </div>
      </Card>
      <Card className="p-6 flex items-center gap-5">
        <ScoreGauge value={coverage} ariaLabel={t("portfolioCoverage")} />
        <div className="flex flex-col gap-1">
          <p className="text-2xs font-extrabold uppercase tracking-widest text-muted-fg">
            {t("portfolioCoverage")}
          </p>
          <p className="font-display text-xl font-extrabold tabular-nums text-foreground">
            {auditedCount ?? "—"}
            <span className="text-xs font-mono text-muted-fg">/{projectCount ?? "—"}</span>
          </p>
        </div>
      </Card>
    </div>
  );
}
