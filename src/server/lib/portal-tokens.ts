import { createHmac, timingSafeEqual } from "node:crypto";

export interface PortalToken {
  projectId: string;
  exp: number;
}

function secret(): string {
  const s = process.env.PORTAL_LINK_SECRET || process.env.DATA_ENCRYPTION_KEY || "";
  if (!s) {
    throw new Error("PORTAL_LINK_SECRET (o DATA_ENCRYPTION_KEY) no configurado.");
  }
  return s;
}

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function unb64url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

/**
 * portal-tokens.ts — Links firmados de portal cliente (B-4).
 *
 * Formato: base64url(payload).base64url(hmac). Sin estado en BD: la
 * expiración viaja dentro del token. Rotar = cambiar el secreto.
 */
export function signPortalToken(projectId: string, ttlSeconds = 90 * 86400): string {
  const payload: PortalToken = {
    projectId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyPortalToken(token: string): PortalToken | null {
  try {
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;
    const expected = createHmac("sha256", secret()).update(body).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(unb64url(body)) as PortalToken;
    if (typeof payload.projectId !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
