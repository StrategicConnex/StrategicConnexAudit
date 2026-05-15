import { db } from '@/shared/db';
import { projects, audits, integrations } from '@/shared/db/schemas';
import { eq, desc, isNull, and } from 'drizzle-orm';
import { DashboardContainer } from './components/DashboardContainer';
import { createClient } from '@/shared/lib/supabase/server';
import { redirect } from 'next/navigation';
import { withRLS } from '@/shared/db/rls';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
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

    // 3. Fetch integration counts and latest audits in parallel for user's projects
    const data = await Promise.all(
      projectsList.map(async (project) => {
        const projectIntegrations = await tx
          .select()
          .from(integrations)
          .where(eq(integrations.projectId, project.id));

        const latestAudits = await tx
          .select()
          .from(audits)
          .where(eq(audits.projectId, project.id))
          .orderBy(desc(audits.createdAt))
          .limit(1);

        return {
          ...project,
          integrations: projectIntegrations,
          latestAudit: latestAudits[0] || null,
        };
      })
    );

    return { allProjects: projectsList, dashboardData: data };
  });

  return (
    <DashboardContainer 
      initialProjects={allProjects} 
      dashboardData={dashboardData} 
    />
  );
}