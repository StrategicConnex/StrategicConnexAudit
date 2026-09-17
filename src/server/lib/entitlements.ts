import "server-only";
import { and, count, eq, isNull } from "drizzle-orm";
import { directDb } from "@/shared/db";
import { users, subscriptionPlans, projects, projectMembers, keywordTargets } from "@/shared/db/schemas";

export interface Entitlements {
  planName: string;
  maxProjects: number;
  maxKeywords: number;
  seats: number;
  whiteLabel: boolean;
  apiAccess: boolean;
  projectsUsed: number;
  keywordsUsed: number;
  seatsUsed: number;
}

const FREE_FALLBACK = {
  planName: "free",
  maxProjects: 1,
  maxKeywords: 50,
  seats: 1,
  whiteLabel: false,
  apiAccess: false,
};

/**
 * entitlements.ts — Plan y uso del usuario (A-4).
 *
 * Plan: users.plan_id → subscription_plans (default: fila 'free', último
 * recurso constantes). Uso: proyectos propios activos, keywords en ellos,
 * asientos (owner + miembros únicos).
 */
export async function getEntitlements(userId: string): Promise<Entitlements> {
  const [user] = await directDb
    .select({ planId: users.planId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  let plan = user?.planId
    ? await directDb.query.subscriptionPlans.findFirst({
      where: eq(subscriptionPlans.id, user.planId),
    })
    : undefined;
  plan ??= await directDb.query.subscriptionPlans.findFirst({
    where: eq(subscriptionPlans.name, "free"),
  });

  const features = (plan?.features ?? {}) as {
    seats?: number;
    whiteLabel?: boolean;
    apiAccess?: boolean;
  };

  const owned = await directDb
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.ownerId, userId),
        isNull(projects.deletedAt),
        eq(projects.isDeleted, false),
        eq(projects.isHidden, false)
      )
    );
  const ownedIds = owned.map((p) => p.id);

  let keywordsUsed = 0;
  for (const pid of ownedIds) {
    const [row] = await directDb
      .select({ n: count() })
      .from(keywordTargets)
      .where(eq(keywordTargets.projectId, pid));
    keywordsUsed += Number(row?.n ?? 0);
  }

  // Asientos: owner + miembros únicos en sus proyectos.
  const seatSet = new Set<string>([userId]);
  for (const pid of ownedIds) {
    const rows = await directDb
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(eq(projectMembers.projectId, pid));
    for (const r of rows) seatSet.add(r.userId);
  }
  const seatsUsed = seatSet.size;

  return {
    planName: plan?.name ?? FREE_FALLBACK.planName,
    maxProjects: plan?.maxProjects ?? FREE_FALLBACK.maxProjects,
    maxKeywords: plan?.maxKeywords ?? FREE_FALLBACK.maxKeywords,
    seats: typeof features.seats === "number" ? features.seats : FREE_FALLBACK.seats,
    whiteLabel: features.whiteLabel === true,
    apiAccess: features.apiAccess === true,
    projectsUsed: ownedIds.length,
    keywordsUsed,
    seatsUsed,
  };
}
