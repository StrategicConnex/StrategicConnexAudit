import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { directDb } from "@/shared/db";
import { withRLS } from "@/shared/db/rls";
import { notifications } from "@/shared/db/schemas/notifications";
import { projects, projectMembers } from "@/shared/db/schemas";
import { logger } from "@/lib/logger";

/**
 * emit.ts — Bandeja de notificaciones (Tanda 2 / B3).
 *
 * `emitNotification` es fire-and-forget: un fallo al avisar nunca debe romper
 * el trabajo que lo motivó (una auditoría, un escalado de SLA). Devuelve el id
 * o null, jamás lanza.
 */

export type NotificationKind =
  | "finding_overdue"
  | "finding_assigned"
  | "audit_completed"
  | "scan_failed"
  | "integration_error"
  | "system";

export interface EmitNotificationInput {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  projectId?: string | null;
  link?: string | null;
  metadata?: Record<string, unknown>;
}

export async function emitNotification(input: EmitNotificationInput): Promise<string | null> {
  try {
    const [row] = await directDb
      .insert(notifications)
      .values({
        userId: input.userId,
        kind: input.kind,
        title: input.title.slice(0, 200),
        body: input.body.slice(0, 1000),
        projectId: input.projectId ?? null,
        link: input.link ?? null,
        metadata: input.metadata ?? {},
      })
      .returning({ id: notifications.id });
    return row?.id ?? null;
  } catch (err) {
    logger.error("[Notifications] No se pudo emitir la notificación", {
      message: (err as Error).message?.slice(0, 200),
    });
    return null;
  }
}

/**
 * Destinatarios "de gestión" de un proyecto: el owner y los miembros con rol
 * admin. Son quienes pueden actuar sobre un hallazgo vencido.
 */
export async function listProjectAdmins(projectId: string): Promise<string[]> {
  const project = await directDb.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: { ownerId: true },
  });
  const members = await directDb
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(
      and(eq(projectMembers.projectId, projectId), inArray(projectMembers.role, ["owner", "admin"])),
    );

  const ids = new Set<string>();
  if (project?.ownerId) ids.add(project.ownerId);
  for (const m of members) ids.add(m.userId);
  return [...ids];
}

/** Emite la misma notificación a todos los gestores del proyecto. */
export async function notifyProjectAdmins(
  input: Omit<EmitNotificationInput, "userId"> & { projectId: string },
): Promise<number> {
  const recipients = await listProjectAdmins(input.projectId);
  let emitted = 0;
  for (const userId of recipients) {
    const id = await emitNotification({ ...input, userId });
    if (id) emitted++;
  }
  return emitted;
}

export interface InboxNotification {
  id: string;
  projectId: string | null;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  metadata: Record<string, unknown>;
  readAt: string | null;
  createdAt: string | null;
}

export const INBOX_LIMIT = 50;

/**
 * Bandeja del usuario, vía withRLS: la política de Postgres vuelve a filtrar
 * por `user_id`, así que ni un bug de parámetros podría cruzar bandejas.
 */
export async function listNotifications(
  userId: string,
  opts: { limit?: number; unreadOnly?: boolean } = {},
): Promise<InboxNotification[]> {
  const limit = Math.min(opts.limit ?? INBOX_LIMIT, INBOX_LIMIT);
  const rows = await withRLS(userId, (tx) =>
    tx
      .select({
        id: notifications.id,
        projectId: notifications.projectId,
        kind: notifications.kind,
        title: notifications.title,
        body: notifications.body,
        link: notifications.link,
        metadata: notifications.metadata,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(
        opts.unreadOnly
          ? and(eq(notifications.userId, userId), isNull(notifications.readAt))
          : eq(notifications.userId, userId),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(limit),
  );

  return rows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    kind: r.kind,
    title: r.title,
    body: r.body,
    link: r.link,
    metadata: r.metadata,
    readAt: r.readAt?.toISOString() ?? null,
    createdAt: r.createdAt?.toISOString() ?? null,
  }));
}

/** Nº de no leídas para el badge de la campana. */
export async function countUnread(userId: string): Promise<number> {
  const rows = await withRLS(userId, (tx) =>
    tx
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
  );
  return rows[0]?.n ?? 0;
}

/** Marca UNA notificación como leída. Devuelve false si no era del usuario. */
export async function markNotificationRead(userId: string, id: string): Promise<boolean> {
  const updated = await withRLS(userId, (tx) =>
    tx
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .returning({ id: notifications.id }),
  );
  return updated.length > 0;
}

/** Marca todas las no leídas como leídas. Devuelve cuántas. */
export async function markAllNotificationsRead(userId: string): Promise<number> {
  const updated = await withRLS(userId, (tx) =>
    tx
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
      .returning({ id: notifications.id }),
  );
  return updated.length;
}

/**
 * Ids de hallazgos ya escalados recientemente (por metadata.findingId).
 * Evita que el barrido diario vuelva a avisar del mismo hallazgo cada día.
 */
export async function listRecentlyEscalatedFindingIds(
  kind: NotificationKind,
  sinceHours: number,
): Promise<Set<string>> {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
  const rows = await directDb
    .select({ fid: sql<string>`${notifications.metadata}->>'findingId'` })
    .from(notifications)
    .where(and(eq(notifications.kind, kind), sql`${notifications.createdAt} >= ${since}`));
  return new Set(rows.map((r) => r.fid).filter((f): f is string => Boolean(f)));
}

/** Purga la bandeja por retención (90 días). Alimenta el mantenimiento diario. */
export async function purgeOldNotifications(retentionDays = 90): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const deleted = await directDb
    .delete(notifications)
    .where(sql`${notifications.createdAt} < ${cutoff}`);
  return deleted.rowCount ?? 0;
}
