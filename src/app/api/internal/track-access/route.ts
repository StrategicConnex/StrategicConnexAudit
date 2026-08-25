import { NextResponse, type NextRequest } from "next/server";
import { directDb } from "@/shared/db";
import { userLogs } from "@/shared/db/schemas";
import { sql } from "drizzle-orm";

/* ═══════════════════════════════════════════════════════════════════════
   POST /api/internal/track-access — Telemetría de accesos (solo interno)

   Invocado por el proxy de Next (updateSession) fire-and-forget para cada
   request autenticado (throttled a 1 cada 5 min por cliente vía cookie
   `sl_track`). Hace upsert en user_logs: email, IP (x-forwarded-for /
   x-real-ip) y país (x-vercel-ip-country).

   SECURITY: solo acepta llamadas con sesión válida (cookie del propio
   origen); usa directDb (conexión de servicio) para escribir sin depender
   de RLS. No se expone nada en la respuesta.
   ═══════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    // 1. Sesión válida requerida (la cookie viaja automáticamente mismo-origen)
    const { createClient } = await import("@/shared/lib/supabase/server");
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    // 2. Extraer IP y país de los headers del request
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      null;
    const country = request.headers.get("x-vercel-ip-country") ?? null;
    const userAgent = request.headers.get("user-agent")?.slice(0, 400) ?? null;

    // 3. Upsert por user_id (1 fila por usuario)
    await directDb
      .insert(userLogs)
      .values({
        userId: user.id,
        email: user.email,
        lastLogin: new Date(),
        ipAddress: ip,
        country,
        userAgent,
      })
      .onConflictDoUpdate({
        target: userLogs.userId,
        set: {
          email: user.email,
          lastLogin: new Date(),
          ipAddress: ip,
          country,
          userAgent,
          accessCount: sql`${userLogs.accessCount} + 1`,
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({ ok: true });
  } catch (err) {
    // La telemetría nunca debe romper la navegación
    console.error("[track-access] fallo (no bloqueante):", err);
    return NextResponse.json({ ok: false }, { status: 204 });
  }
}
