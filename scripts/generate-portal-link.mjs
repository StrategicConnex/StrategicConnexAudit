/**
 * generate-portal-link.mjs — Genera un link de portal cliente firmado.
 *
 * Replica exactamente signPortalToken() de src/server/lib/portal-tokens.ts:
 * payload { projectId, exp } en base64url + HMAC-SHA256(base64url).
 * TTL por defecto: 90 días (igual que el default de producción).
 *
 * Uso:
 *   node scripts/generate-portal-link.mjs <projectId> [ttlDias]
 */
import fs from "node:fs";
import crypto from "node:crypto";

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const secret = env.PORTAL_LINK_SECRET;
if (!secret) {
  console.error("PORTAL_LINK_SECRET no está en .env.local");
  process.exit(1);
}

const projectId = process.argv[2];
if (!projectId) {
  console.error("Uso: node scripts/generate-portal-link.mjs <projectId> [ttlDias]");
  process.exit(1);
}
const ttlSeconds = Number(process.argv[3] ?? 90 * 86400);

const payload = { projectId, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
const token = `${body}.${sig}`;

const baseUrl = env.NEXT_PUBLIC_SITE_URL || "https://scaudit.vercel.app";
console.log(`Link del portal (${Math.round(ttlSeconds / 86400)} días):`);
console.log(`${baseUrl}/p/${token}`);
