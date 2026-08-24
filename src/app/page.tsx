import { Suspense } from 'react';
import { projects, audits, integrations } from '@/shared/db/schemas';
import { eq, desc, isNull, and, inArray } from 'drizzle-orm';
import { DashboardContainer } from '@/features/dashboard/DashboardContainer';
import { createClient } from '@/shared/lib/supabase/server';
import { redirect } from 'next/navigation';
import { withRLS } from '@/shared/db/rls';
import { DashboardSkeleton } from '@/features/dashboard/DashboardSkeleton';

export const dynamic = 'force-dynamic';

async function DashboardContent() {
  // ── Dev bypass: saltea auth y DB queries en desarrollo ──
  const DEV_BYPASS = process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true';

  if (DEV_BYPASS) {
    return (
      <DashboardContainer 
        initialProjects={[]} 
        dashboardData={[]} 
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
  const { allProjects, dashboardData } = await withRLS(user.id, async (tx) => {
    const projectsList = await tx
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.ownerId, user.id),
          isNull(projects.deletedAt)
        )
      )
      .orderBy(desc(projects.createdAt));

    // 3. Optimize fetching by doing inArray queries instead of sequential queries (fixes N+1)
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

    // Map the results back to their respective projects in memory
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
  });

  return (
    <DashboardContainer 
      initialProjects={allProjects} 
      dashboardData={dashboardData} 
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