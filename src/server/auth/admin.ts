/**
 * Gate de administración a nivel de plataforma.
 *
 * Conecta el campo `users.role` (roleEnum: admin | manager | client) con las
 * rutas que exponen datos GLOBALES de la plataforma (logs de auditoría de
 * seguridad, alertas SIEM, telemetría de salud IA, ejecución de exportaciones
 * SIEM). Antes de este gate, cualquier usuario autenticado podía leer esos
 * recursos cross-tenant.
 *
 * Uso en Route Handlers:
 *   const gate = await requireAdmin();
 *   if (!gate.ok) return gate.response;
 *
 * Uso en Server Actions:
 *   await assertPlatformAdmin(); // lanza si no es admin
 */

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createClient } from "@/shared/lib/supabase/server";
import { db } from "@/shared/db";
import { users } from "@/shared/db/schemas";

export type PlatformRole = "admin" | "manager" | "client";

export type AdminGate =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

function unauthorized() {
  return NextResponse.json(
    { success: false, error: "No autorizado" },
    { status: 401 },
  );
}

function forbidden() {
  return NextResponse.json(
    { success: false, error: "Prohibido: se requiere rol admin" },
    { status: 403 },
  );
}

async function getPlatformRole(userId: string): Promise<PlatformRole | null> {
  const [row] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.role ?? null;
}

/** Gate para Route Handlers: devuelve la respuesta de error lista para `return`. */
export async function requireAdmin(): Promise<AdminGate> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: unauthorized() };
  }

  const role = await getPlatformRole(user.id);
  if (role !== "admin") {
    return { ok: false, response: forbidden() };
  }

  return { ok: true, userId: user.id };
}

/** Gate para Server Actions: lanza si el usuario no es admin de plataforma. */
export async function assertPlatformAdmin(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("No autorizado");
  }

  const role = await getPlatformRole(user.id);
  if (role !== "admin") {
    throw new Error("Prohibido: se requiere rol admin");
  }

  return user.id;
}
