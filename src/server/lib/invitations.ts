import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { directDb } from "@/shared/db";
import { projectInvitations, projectMembers, teamAuditLogs } from "@/shared/db/schemas";
import { logger } from "@/lib/logger";
import type { ProjectRole } from "@/server/auth/rbac";
import { appUrl } from "@/shared/lib/app-url";

const INVITE_TTL_DAYS = 7;

/**
 * Envía la invitación por email vía Resend directo. Si no hay RESEND_API_KEY,
 * no falla: retorna el link para compartir manualmente (honesto, no fake).
 */
export async function sendInviteEmail(
  toEmail: string,
  projectName: string,
  role: ProjectRole,
  inviteUrl: string
): Promise<{ sent: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.SIEM_EMAIL_FROM;
  if (!apiKey || !from) {
    logger.warn("Invitación sin email (sin RESEND_API_KEY): compartir link manual", {
      toEmail,
    });
    return { sent: false };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [toEmail],
        subject: `Te invitaron al proyecto ${projectName} (rol: ${role})`,
        html: `<p>Te invitaron a colaborar en <strong>${projectName}</strong> con rol <strong>${role}</strong>.</p><p><a href="${inviteUrl}">Aceptar invitación</a> (vence en ${INVITE_TTL_DAYS} días).</p>`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return { sent: res.ok };
  } catch (err) {
    logger.error("Envío de invitación falló", { error: err instanceof Error ? err.message : String(err) });
    return { sent: false };
  }
}

export interface CreatedInvitation {
  id: string;
  email: string;
  role: ProjectRole;
  expiresAt: string;
  inviteUrl: string;
  emailSent: boolean;
}

/**
 * Crea (o refresca) una invitación: upsert por (projectId, email).
 * Solo owner/admin deben llamar (verificado en la ruta con canPerformAction).
 */
export async function createInvitation(
  projectId: string,
  projectName: string,
  email: string,
  role: Exclude<ProjectRole, "owner">,
  invitedBy: string
): Promise<CreatedInvitation> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400000);

  const [row] = await directDb
    .insert(projectInvitations)
    .values({ projectId, email: email.toLowerCase(), role, token, expiresAt, invitedBy })
    .onConflictDoUpdate({
      target: [projectInvitations.projectId, projectInvitations.email],
      set: { token, role, expiresAt, invitedBy },
    })
    .returning({ id: projectInvitations.id, expiresAt: projectInvitations.expiresAt });

  await directDb.insert(teamAuditLogs).values({
    projectId,
    actorId: invitedBy,
    action: "member_invited",
    targetEmail: email.toLowerCase(),
    role,
  });

  const inviteUrl = `${appUrl()}/invite/${token}`;
  const { sent } = await sendInviteEmail(email, projectName, role, inviteUrl);

  return {
    id: row!.id,
    email: email.toLowerCase(),
    role,
    expiresAt: row!.expiresAt.toISOString(),
    inviteUrl,
    emailSent: sent,
  };
}

export interface AcceptResult {
  ok: boolean;
  error?: string;
  projectId?: string;
}

/**
 * Acepta una invitación: valida token+expiración, crea membresía, consume
 * la invitación y audita. Idempotente (re-aceptar con el mismo usuario = ok).
 */
export async function acceptInvitation(token: string, userId: string): Promise<AcceptResult> {
  const [inv] = await directDb
    .select()
    .from(projectInvitations)
    .where(eq(projectInvitations.token, token))
    .limit(1);

  if (!inv) return { ok: false, error: "Invitación inválida o ya usada" };
  if (inv.expiresAt.getTime() < Date.now()) {
    await directDb.delete(projectInvitations).where(eq(projectInvitations.id, inv.id));
    return { ok: false, error: "La invitación venció" };
  }

  await directDb
    .insert(projectMembers)
    .values({ projectId: inv.projectId, userId, role: inv.role })
    .onConflictDoUpdate({
      target: [projectMembers.projectId, projectMembers.userId],
      set: { role: inv.role },
    });

  await directDb.delete(projectInvitations).where(eq(projectInvitations.id, inv.id));
  await directDb.insert(teamAuditLogs).values({
    projectId: inv.projectId,
    actorId: userId,
    action: "member_joined",
    targetEmail: inv.email,
    role: inv.role,
  });

  return { ok: true, projectId: inv.projectId };
}

/** Anula una invitación pendiente (owner/admin). */
export async function rescindInvitation(invitationId: string): Promise<boolean> {
  const deleted = await directDb
    .delete(projectInvitations)
    .where(eq(projectInvitations.id, invitationId))
    .returning({ id: projectInvitations.id });
  return deleted.length > 0;
}

/** Expulsa un miembro (no al owner; el owner no está en project_members). */
export async function removeMember(projectId: string, userId: string): Promise<boolean> {
  const deleted = await directDb
    .delete(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .returning({ id: projectMembers.id });
  return deleted.length > 0;
}
