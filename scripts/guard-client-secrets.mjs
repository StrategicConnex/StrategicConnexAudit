#!/usr/bin/env node
/**
 * RULE-001 guard (SC Platform Engineering Super Skill v3.1)
 * ---------------------------------------------------------
 * FALLA el CI si:
 *   1. `env-secrets` se importa desde código que puede viajar al bundle del
 *      navegador (componentes, features, client.ts, páginas, layouts...).
 *   2. `env.ts` vuelve a definir getters de credenciales (solo debe contener
 *      valores públicos NEXT_PUBLIC_*).
 *
 * Lista blanca de dónde es LEGÍTIMO importar env-secrets (server-side):
 *   - src/server/**
 *   - src/app/api/**            (route handlers = servidor)
 *   - src/trigger/**            (jobs Trigger.dev = servidor)
 *   - src/scripts/**            (CLIs de mantenimiento = servidor)
 *   - src/shared/lib/supabase/admin.ts (cliente admin, server-only por diseño)
 *
 * Uso:
 *   node scripts/guard-client-secrets.mjs        # exit 0 = OK, 1 = violación
 *   pnpm guard:secrets
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Detecta IMPORTS reales del módulo (no menciones en comentarios/docs):
//   import { envSecrets } from "@/shared/config/env-secrets"
//   import * as x from '@/shared/config/env-secrets'
//   require("...env-secrets")
const SECRETS_IMPORT_RE = /(?:import\s+(?:[^"']*?\s+from\s+)?["'][^"']*env-secrets["']|require\(["'][^"']*env-secrets["']\))/;

const ALLOWED_PREFIXES = [
  "src/server",
  "src/app/api",
  "src/trigger",
  "src/scripts",
];

const ALLOWED_FILES = ["src/shared/lib/supabase/admin.ts"];

/** Getters de secretos que NUNCA deben reaparecer en env.ts. */
const FORBIDDEN_GETTERS = [
  "supabaseServiceKey",
  "databaseUrl",
  "directUrl",
  "triggerSecretKey",
  "geminiApiKey",
  "bearerApiKey",
  "aiBaseUrl",
  "openRouterApiKey",
  "openRouterBaseUrl",
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      walk(full, out);
    } else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function toRel(p) {
  return path.relative(ROOT, p).split(path.sep).join("/");
}

const violations = [];

// ── Check 1: env-secrets importado fuera de la lista blanca server-side ─────
for (const file of walk(path.join(ROOT, "src"))) {
  const rel = toRel(file);
  const content = fs.readFileSync(file, "utf-8");
  if (!SECRETS_IMPORT_RE.test(content)) continue;
  const allowed =
    ALLOWED_PREFIXES.some((p) => rel.startsWith(p + "/")) ||
    ALLOWED_FILES.includes(rel);
  if (!allowed) {
    violations.push(
      `env-secrets importado desde código de cliente: ${rel} (permitido solo en ${[...ALLOWED_PREFIXES, ...ALLOWED_FILES].join(", ")})`
    );
  }
}

// ── Check 2: env.ts no debe contener getters de secretos ────────────────────
const envTs = path.join(ROOT, "src", "shared", "config", "env.ts");
if (fs.existsSync(envTs)) {
  const envContent = fs.readFileSync(envTs, "utf-8");
  for (const getter of FORBIDDEN_GETTERS) {
    // Busca la definición real del getter (get nombre) — los comentarios
    // históricos que solo mencionan el nombre no disparan el guard.
    if (new RegExp(`get\\s+${getter}\\s*\\(`).test(envContent)) {
      violations.push(
        `env.ts vuelve a definir el getter de secretos '${getter}' — debe vivir en env-secrets.ts`
      );
    }
  }
}

if (violations.length > 0) {
  console.error("❌ RULE-001 VIOLATION (guard-client-secrets):");
  for (const v of violations) console.error(`   - ${v}`);
  console.error(
    "\nLos secretos solo pueden importarse desde server-side (src/server, src/app/api, src/trigger, src/scripts)."
  );
  process.exit(1);
}

console.log(
  "✅ RULE-001 OK: env-secrets solo se importa desde server-side; env.ts sin getters de secretos."
);
