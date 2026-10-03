import { Suspense } from 'react';
import { projects, audits, integrations } from '@/shared/db/schemas';
import { eq, desc, isNull, and, inArray } from 'drizzle-orm';
import { DashboardContainer } from '@/features/dashboard/DashboardContainer';
import { createClient } from '@/shared/lib/supabase/server';
import { redirect } from 'next/navigation';
import { withRLS } from '@/shared/db/rls';
import { directDb } from '@/shared/db';
import { DashboardSkeleton } from '@/features/dashboard/DashboardSkeleton';
import type { DbTransaction } from '@/shared/lib/actions';

export const dynamic = 'force-dynamic';

/** Debe coincidir con DEV_BYPASS_USER_ID de @/shared/lib/actions. */
const DEV_BYPASS_USER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Carga proyectos + integraciones + último audit de un usuario.
 * `tx` es la transacción con RLS en producción o `directDb` en dev-bypass.
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

  // inArray en lugar de queries secuenciales (evita N+1)
  const projectIds = projectsList.map(p => p.id);
  let allIntegrations: { projectId: string; [key: string]: unknown }[] = [];
  let allAudits: { id: string; projectId: string; status: string; createdAt: Date | null; [key: string]: unknown }[] = [];

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

  const dashboardData = projectsList.map(project => {
    const projectIntegrations = allIntegrations.filter(i => i.projectId === project.id);
    const projectAudits = allAudits.filter(a => a.projectId === project.id);
    const latestAudit = projectAudits.length > 0 ? projectAudits[0] : null;

    return {
      ...project,
      integrations: projectIntegrations,
      latestAudit: latestAudit ? {
        id: latestAudit.id,
        status: latestAudit.status
      } : null,
    };
  });

  return { allProjects: projectsList, dashboardData };
}

async function DashboardContent() {
  // ── Dev bypass: no hay sesión Supabase, pero los proyectos creados por el
  //    bypass sí existen en la BD (los escribe `directDb`). Devolver arrays
  //    vacíos aquí hacía que el alta "funcionara" y el listado no los mostrara.
  const DEV_BYPASS = process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true';

  if (DEV_BYPASS) {
    const { allProjects, dashboardData } = await loadDashboardData(
      directDb as unknown as DbTransaction,
      DEV_BYPASS_USER_ID,
    );
    return (
      <DashboardContainer
        initialProjects={allProjects}
        dashboardData={dashboardData}
        userInitials="DEV"
      />
    );
  }

  // 1. Authenticate user
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // 2. Fetch only the authenticated user's projects (with ownership verification)
  const { allProjects, dashboardData } = await withRLS(user.id, (tx) =>
    loadDashboardData(tx, user.id),
  );

  return (
    <DashboardContainer
      initialProjects={allProjects}
      dashboardData={dashboardData}
      userInitials={user.email?.slice(0, 2).toUpperCase() ?? '··'}
    />
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}