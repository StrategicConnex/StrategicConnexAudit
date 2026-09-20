import { createHmac } from "node:crypto";

export const dynamic = "force-dynamic";

/**
 * TEMPORAL (diagnóstico portal): devuelve metadatos del secreto sin
 * revelarlo — booleano de presencia, longitud y HMAC-SHA256 de un
 * string fijo. Comparando el probe local vs runtime se prueba la
 * igualdad del valor de forma criptográfica. ELIMINAR tras diagnóstico.
 */
export function GET() {
  const s = process.env.PORTAL_LINK_SECRET || "";
  const probe = createHmac("sha256", s).update("portal-debug-probe").digest("hex");
  return Response.json({ set: s.length > 0, len: s.length, probe });
}
