"use server";

/* ═══════════════════════════════════════════════════════════════════════
   Admin Panel — Server Actions (soft delete / ocultar / restaurar)

   Gate doble en cada acción: rol admin + email allowlist. Sin DELETE:
   solo UPDATE (is_deleted / is_hidden / deleted_at).
   ═══════════════════════════════════════════════════════════════════════ */

import { directDb } from "@/shared/db";
import { projects } from "@/shared/db/schemas";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/server/auth/admin";
import { revalidatePath } from "next/cache";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "palacios_juan@hotmail.com";

async function assertAdminEmail(): Promise<void> {
  const gate = await requireAdmin();
  if (!gate.ok) throw new Error("Prohibido: se requiere rol admin");
  const { createClient } = await import("@/shared/lib/supabase/server");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    throw new Error("Prohibido: email no autorizado");
  }
}

export async function setProjectHidden(projectId: string, hidden: boolean): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertAdminEmail();
    await directDb
      .update(projects)
      .set({ isHidden: hidden, updatedAt: new Date() })
      .where(eq(projects.id, projectId));
    revalidatePath("/admin");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error interno" };
  }
}

export async function softDeleteProject(projectId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertAdminEmail();
    await directDb
      .update(projects)
      .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(projects.id, projectId));
    revalidatePath("/admin");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error interno" };
  }
}

export async function restoreProject(projectId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertAdminEmail();
    await directDb
      .update(projects)
      .set({ isDeleted: false, isHidden: false, deletedAt: null, updatedAt: new Date() })
      .where(eq(projects.id, projectId));
    revalidatePath("/admin");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error interno" };
  }
}
