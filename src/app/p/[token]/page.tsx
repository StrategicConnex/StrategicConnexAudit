import { notFound } from "next/navigation";
import Link from "next/link";
import { Activity } from "lucide-react";
import { directDb } from "@/shared/db";
import { projects, uptimeLogs, audits, issues, aiReportJobs, execBriefs } from "@/shared/db/schemas";
import { and, count, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { verifyPortalToken } from "@/server/lib/portal-tokens";
import { ClientScoreCard } from "@/components/ClientScoreCard";
import { TrendChart, type TrendPoint } from "@/components/TrendChart";
import { MetricCard } from "@/components/MetricCard";
import { AuditStatusBadge } from "@/components/ui/AuditStatusBadge";
import { Card } from "@/components/ui/Card";
import { PortalPdfButton } from "./components/PortalPdfButton";
import { ExecBriefSection } from "./components/ExecBriefSection";
import { healthScoreFor } from "@/components/issue-impact";
import { CATEGORY_LABELS } from "@/components/IssueList";

export const dynamic = "force-dynamic";

interface Branding {
  brandName?: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
}

/** Ventana de 30 días calculada fuera del render (regla no-impure-render). */
function thirtyDaysAgo(): Date {
  return new Date(Date.now() - 30 * 86400000);
}

const CATEGORY_ORDER = ['seo', 'meta', 'performance', 'security', 'link', 'accessibility'];

/**
 * GET /p/[token] — Portal cliente read-only con marca blanca (B-4).
 *
 * Sin sesión: el token firmado ES la autorización (expira). Solo expone
 * KPIs agregados y lista de informes (sin contenido completo ni PII).
 */
export default async function ClientPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const payload = verifyPortalToken(token);
  if (!payload) notFound();

  const [project] = await directDb
    .select({
      id: projects.id,
      name: projects.name,
      domain: projects.domain,
      settings: projects.settings,
    })
    .from(projects)
    .where(
      and(
        eq(projects.id, payload.projectId),
        eq(projects.isDeleted, false),
        eq(projects.isHidden, false)
      )
    )
    .limit(1);

  if (!project) notFound();

  const branding = ((project.settings ?? {}) as { branding?: Branding }).branding ?? {};
  const brandName = branding.brandName || project.name;
  const accent = branding.primaryColor || "#D4A843";

  const since = thirtyDaysAgo();
  const [up] = await directDb
    .select({ total: count(), ups: sql<number>`count(*) filter (where ${uptimeLogs.isUp})` })
    .from(uptimeLogs)
    .where(and(eq(uptimeLogs.projectId, project.id), gte(uptimeLogs.checkedAt, since)));
  const total = Number(up?.total ?? 0);
  const ups = Number(up?.ups ?? 0);
  const uptimePct = total > 0 ? `${(Math.round((ups / total) * 1000) / 10).toFixed(1)}%` : "—";

  // Últimas 10 completadas → tendencia de 30 días (2 queries, sin N+1)
  const recentCompleted = await directDb
    .select({ id: audits.id, createdAt: audits.createdAt })
    .from(audits)
    .where(and(eq(audits.projectId, project.id), eq(audits.status, "completed")))
    .orderBy(desc(audits.createdAt))
    .limit(10);

  const completedIds = recentCompleted.map((a) => a.id);
  const perAudit = completedIds.length > 0
    ? await directDb
        .select({
          auditId: issues.auditId,
          criticalCount: count(sql`case when ${issues.severity} = 'critical' then 1 end`),
          warningCount: count(sql`case when ${issues.severity} = 'warning' then 1 end`),
        })
        .from(issues)
        .where(inArray(issues.auditId, completedIds))
        .groupBy(issues.auditId)
    : [];
  const scoreByAudit = new Map(
    perAudit.map((r) => [
      r.auditId,
      healthScoreFor(Number(r.criticalCount || 0), Number(r.warningCount || 0)),
    ]),
  );
  const trend: TrendPoint[] = [...recentCompleted]
    .reverse()
    .map((a) => ({
      label: a.createdAt
        ? new Date(a.createdAt).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })
        : "—",
      value: scoreByAudit.get(a.id) ?? 100,
    }));

  const latest = recentCompleted[0] ?? null;
  const score = latest ? (scoreByAudit.get(latest.id) ?? null) : null;

  // Scores por categoría de la última auditoría completada
  const catRows = latest
    ? await directDb
        .select({
          category: issues.category,
          severity: issues.severity,
          n: count(),
        })
        .from(issues)
        .where(eq(issues.auditId, latest.id))
        .groupBy(issues.category, issues.severity)
    : [];
  const byCat = new Map<string, { c: number; w: number }>();
  for (const r of catRows) {
    const entry = byCat.get(r.category) ?? { c: 0, w: 0 };
    if (r.severity === "critical") entry.c += Number(r.n);
    else if (r.severity === "warning") entry.w += Number(r.n);
    byCat.set(r.category, entry);
  }
  const catScores = CATEGORY_ORDER.filter((c) => byCat.has(c)).map((c) => ({
    label: CATEGORY_LABELS[c] ?? c,
    value: healthScoreFor(byCat.get(c)!.c, byCat.get(c)!.w),
  }));

  const recentAudits = await directDb
    .select({ id: audits.id, createdAt: audits.createdAt, status: audits.status })
    .from(audits)
    .where(eq(audits.projectId, project.id))
    .orderBy(desc(audits.createdAt))
    .limit(5);

  const reports = await directDb.query.aiReportJobs.findMany({
    where: eq(aiReportJobs.projectId, project.id),
    orderBy: [desc(aiReportJobs.createdAt)],
    limit: 5,
    columns: { id: true, createdAt: true, isFallback: true },
  });

  // Resumen ejecutivo IA (Sprint 3): fila viva del proyecto (replaced_at IS
  // NULL). Sin brief → la sección no se renderiza.
  const [brief] = await directDb
    .select({
      content: execBriefs.content,
      isFallback: execBriefs.isFallback,
      createdAt: execBriefs.createdAt,
    })
    .from(execBriefs)
    .where(and(eq(execBriefs.projectId, project.id), isNull(execBriefs.replacedAt)))
    .limit(1);

  return (
    <div className="min-h-dvh w-full bg-background text-foreground">
      <div id="portal-export-content" className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-8">
        <div className="text-center space-y-2">
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt={brandName} className="h-10 mx-auto object-contain" />
          ) : null}
          <p className="text-2xs font-extrabold uppercase tracking-widest text-muted-fg">
            Reporte para clientes
          </p>
          <h1 className="font-display text-3xl font-black tracking-tight">{brandName}</h1>
          <p className="text-sm text-muted-fg font-mono">{project.domain}</p>
        </div>

        <ClientScoreCard
          overall={score}
          overallLabel={`Salud SEO de ${brandName}`}
          categories={catScores}
          accent={accent}
        />

        <ExecBriefSection
          content={brief?.content ?? null}
          isFallback={brief?.isFallback ?? false}
          updatedAt={brief?.createdAt ?? null}
        />

        <Card className="p-6 sm:p-8">
          <h2 className="text-sm font-extrabold uppercase tracking-widest text-muted-fg">
            Tendencia · últimos 30 días
          </h2>
          <div className="mt-4">
            <TrendChart
              points={trend}
              ariaLabel={`Evolución de la salud SEO de ${brandName}`}
              accent={accent}
              emptyLabel="Sin auditorías completadas en los últimos 30 días."
            />
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <MetricCard
            icon={<Activity aria-hidden="true" />}
            label="Uptime 30d"
            value={uptimePct}
          />
          <Card className="p-5">
            <p className="text-2xs font-extrabold uppercase tracking-widest text-muted-fg">
              Últimas auditorías
            </p>
            {recentAudits.length === 0 ? (
              <p className="mt-2 text-xs text-muted-fg">Aún no hay auditorías.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {recentAudits.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="tabular-nums text-muted-fg">
                      {a.createdAt
                        ? new Date(a.createdAt).toLocaleDateString("es-ES", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </span>
                    <AuditStatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="glass-card p-6">
          <h2 className="text-sm font-extrabold uppercase tracking-widest text-muted-fg mb-3">
            Últimos informes
          </h2>
          {reports.length === 0 ? (
            <p className="text-sm text-muted-fg">Aún no hay informes publicados.</p>
          ) : (
            <ul className="space-y-2">
              {reports.map((r) => (
                <li key={r.id} className="flex items-center justify-between text-sm">
                  <span>
                    Informe del{" "}
                    {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}
                  </span>
                  {r.isFallback && (
                    <span className="text-2xs text-muted-fg">resumen automático</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col items-center gap-2 pt-2">
          <PortalPdfButton targetElementId="portal-export-content" />
          <p className="text-2xs text-muted-fg">
            Generado por <span className="font-bold">StrategicAudit Pro</span>
          </p>
        </div>
        <p className="text-center">
          <Link href="/" className="text-sm text-primary hover:underline">
            Inicio
          </Link>
        </p>
      </div>
    </div>
  );
}
