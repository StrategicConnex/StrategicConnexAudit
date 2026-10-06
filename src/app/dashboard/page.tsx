import { Suspense } from "react";
import { projects, audits, integrations, issues } from "@/shared/db/schemas";
import { eq, desc, isNull, and, inArray, count, sql } from "drizzle-orm";
import { healthFromIssueCounts } from "@/shared/utils/health-score";
import { DashboardContainer } from "@/features/dashboard/DashboardContainer";
import { DashboardSkeleton } from "@/features/dashboard/DashboardSkeleton";
import { createClient } from "@/shared/lib/supabase/server";
import { redirect } from "next/navigation";
import { withRLS } from "@/shared/db/rls";
import { directDb } from "@/shared/db";
import type { DbTransaction } from "@/shared/lib/actions";

export const dynamic = "force-dynamic";

/** Debe coincidir con DEV_BYPASS_USER_ID de @/shared/lib/actions. */
const DEV_BYPASS_USER_ID = "00000000-0000-0000-0000-000000000001";

/**
 * /dashboard — la vista de portafolio (tanda 3 · B2).
 *
 * Antes esta ruta solo redirigía a `/` porque no existía el roll-up
 * cross-proyecto. Ahora que `PortfolioTab` existe, entrar a `/dashboard`
 * abre directamente la postura agregada: es el enlace que pega un director
 * en un email o a un ticket.
 *
 * Se reutiliza el mismo loader que la raíz en vez de duplicarlo: los dos
 * paths necesitan exactamente los mismos proyectos, integraciones y score de
 * salud por auditoría completada.
 */
async function loadDashboardData(tx: DbTransaction, userId: string) {
  const projectsList = await tx
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.ownerId, userId),
        and(isNull(projects.deletedAt), eq(projects.isDeleted, false), eq(projects.isHidden, false))
      )
    )
    .orderBy(desc(projects.createdAt));

  const projectIds = projectsList.map((p) => p.id);
  let allIntegrations: { projectId: string; [key: string]: unknown }[] = [];
  let allAudits: {
    id: string;
    projectId: string;
    status: string;
    createdAt: Date | null;
    [key: string]: unknown;
  }[] = [];

  if (projectIds.length > 0) {
    allIntegrations = await tx
      .select()
      .from(integrations)
      .where(inArray(integrations.projectId, projectIds));

    allAudits = await tx
      .select()
      .from(audits)
      .where(inArray(audits.projectId, projectIds))
      .orderBy(desc(audits.createdAt));
  }

  // Score real de salud por proyecto: issues de su ÚLTIMA auditoría completada.
  const latestCompletedIds: string[] = [];
  for (const p of projectsList) {
    const completed = allAudits.find((a) => a.projectId === p.id && a.status === "completed");
    if (completed) latestCompletedIds.push(completed.id);
  }
  const issueStatsByAudit = new Map<string, { criticals: number; warnings: number }>();
  if (latestCompletedIds.length > 0) {
    const rows = await tx
      .select({
        auditId: issues.auditId,
        criticals: count(sql`case when ${issues.severity} = 'critical' then 1 end`),
        warnings: count(sql`case when ${issues.severity} = 'warning' then 1 end`),
      })
      .from(issues)
      .where(inArray(issues.auditId, latestCompletedIds))
      .groupBy(issues.auditId);
    for (const row of rows) {
      if (!row.auditId) continue;
      issueStatsByAudit.set(row.auditId, {
        criticals: Number(row.criticals),
        warnings: Number(row.warnings),
      });
    }
  }

  const dashboardData = projectsList.map((project) => {
    const projectIntegrations = allIntegrations.filter((i) => i.projectId === project.id);
    const projectAudits = allAudits.filter((a) => a.projectId === project.id);
    const latestAudit = projectAudits.length > 0 ? projectAudits[0] : null;
    const latestCompleted = projectAudits.find((a) => a.status === "completed") ?? null;
    const issueStats = latestCompleted ? issueStatsByAudit.get(latestCompleted.id) : undefined;
    const healthScore = latestCompleted
      ? healthFromIssueCounts(issueStats?.criticals ?? 0, issueStats?.warnings ?? 0)
      : null;

    return {
      ...project,
      integrations: projectIntegrations,
      latestAudit: latestAudit
        ? {
            id: latestAudit.id,
            status: latestAudit.status,
            healthScore,
            criticalIssues: issueStats?.criticals ?? 0,
            warningIssues: issueStats?.warnings ?? 0,
          }
        : null,
    };
  });

  return { allProjects: projectsList, dashboardData };
}

async function PortfolioContent() {
  const DEV_BYPASS =
    process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true";

  if (DEV_BYPASS) {
    const { allProjects, dashboardData } = await loadDashboardData(
      directDb as unknown as DbTransaction,
      DEV_BYPASS_USER_ID
    );
    return (
      <DashboardContainer
        initialProjects={allProjects}
        dashboardData={dashboardData}
        defaultTab="portfolio"
        userInitials="DEV"
      />
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { allProjects, dashboardData } = await withRLS(user.id, (tx) =>
    loadDashboardData(tx, user.id)
  );

  return (
    <DashboardContainer
      initialProjects={allProjects}
      dashboardData={dashboardData}
      defaultTab="portfolio"
      userInitials={user.email?.slice(0, 2).toUpperCase() ?? "··"}
    />
  );
}

export default function DashboardPortfolioPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <PortfolioContent />
    </Suspense>
  );
}