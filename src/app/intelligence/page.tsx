import { Suspense } from 'react';
import { projects } from '@/shared/db/schemas';
import { eq, desc, isNull, and } from 'drizzle-orm';
import { createClient } from '@/shared/lib/supabase/server';
import { redirect } from 'next/navigation';
import { withRLS } from '@/shared/db/rls';
import { DashboardSkeleton } from '../components/DashboardSkeleton';
import IntelligenceShell from '@/features/intelligence/components/IntelligenceShell';

export const dynamic = 'force-dynamic';

async function IntelligenceDashboardContent() {
  // 1. Authenticate user
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // 2. Fetch only the authenticated user's projects (with ownership verification)
  const allProjects = await withRLS(user.id, async (tx) => {
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

    return projectsList;
  });

  const activeProjectId = allProjects[0]?.id || "sandbox_default";

  return (
    <IntelligenceShell projectId={activeProjectId} />
  );
}

export default function IntelligencePage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <IntelligenceDashboardContent />
    </Suspense>
  );
}

