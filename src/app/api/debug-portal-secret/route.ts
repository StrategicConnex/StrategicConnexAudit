import { createHmac } from "node:crypto";
import { directDb } from "@/shared/db";
import { projects } from "@/shared/db/schemas";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * TEMPORAL (diagnóstico portal): metadatos del secreto sin revelarlo,
 * verificación de un token via ?token= con la MISMA lógica de producción
 * y comprobación del proyecto en la BD del runtime. ELIMINAR tras diagnóstico.
 */
export async function GET(request: Request) {
  const s = process.env.PORTAL_LINK_SECRET || "";
  const probe = createHmac("sha256", s).update("portal-debug-probe").digest("hex");

  // 1) ¿El runtime verifica un token válido con su propio secreto?
  const token = new URL(request.url).searchParams.get("token") ?? "";
  let tokenCheck: Record<string, unknown>;
  try {
    const { verifyPortalToken } = await import("@/server/lib/portal-tokens");
    const payload = token ? verifyPortalToken(token) : null;
    tokenCheck = payload
      ? { valid: true, projectId: payload.projectId, exp: payload.exp }
      : { valid: false };
  } catch (e) {
    tokenCheck = { error: e instanceof Error ? e.message : String(e) };
  }

  // 2) ¿El proyecto existe en LA BD QUE USA EL RUNTIME?
  let db: Record<string, unknown>;
  try {
    const [row] = await directDb
      .select({
        id: projects.id,
        name: projects.name,
        isDeleted: projects.isDeleted,
        isHidden: projects.isHidden,
      })
      .from(projects)
      .where(eq(projects.id, "fc4d00e4-e0b7-4356-945e-f8cd47e06ae9"))
      .limit(1);
    db = { found: !!row, row: row ?? null };
  } catch (e) {
    db = { error: e instanceof Error ? e.message : String(e) };
  }

  return Response.json({
    secret: { set: s.length > 0, len: s.length, probe },
    tokenCheck,
    db,
  });
}
