/* ═══════════════════════════════════════════════════════════════════════════
   Introspección del repositorio para el atlas CAD.

   Lee el código real en cada build: rutas, páginas, esquema Drizzle, journal
   de migraciones, tareas Trigger.dev y registro de tools. Ninguna cifra del
   atlas se escribe a mano: si el código cambia, la lámina cambia.

   Uso:
     import { introspect } from "./introspect.mjs";
     const m = introspect(process.cwd());
   ═══════════════════════════════════════════════════════════════════════════ */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "coverage", "test-results", "backups", ".vercel", ".trigger"]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
    } else {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const rel = (root, p) => path.relative(root, p).split(path.sep).join("/");

/** Cuenta coincidencias de un patrón global sobre un texto. */
function count(text, re) {
  return (text.match(re) || []).length;
}

/** Parsea el registro único de tools: NATIVE_TOOLS + ORPHAN_DEFINITIONS. */
function parseTools(root) {
  const file = path.join(root, "src/server/intelligence/core/tool-registry.ts");
  if (!fs.existsSync(file)) return { total: 0, native: 0, orphan: 0, ids: [], byCategory: [] };
  const src = fs.readFileSync(file, "utf8");

  const native = [...src.matchAll(/definition:\s*\{\s*id:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*category:\s*"([^"]+)"/g)].map((m) => ({
    id: m[1],
    name: m[2],
    category: m[3],
    kind: "native",
  }));

  const orphanBlock = src.slice(src.indexOf("const ORPHAN_DEFINITIONS"), src.indexOf("];", src.indexOf("const ORPHAN_DEFINITIONS")));
  const orphan = [...orphanBlock.matchAll(/\{\s*id:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*category:\s*"([^"]+)"/g)].map((m) => ({
    id: m[1],
    name: m[2],
    category: m[3],
    kind: "orphan",
  }));

  const all = [...native, ...orphan];
  const seen = new Map();
  for (const t of all) if (!seen.has(t.id)) seen.set(t.id, t);
  const tools = [...seen.values()];

  const byCategory = new Map();
  for (const t of tools) byCategory.set(t.category, (byCategory.get(t.category) || 0) + 1);

  return {
    total: tools.length,
    native: native.length,
    orphan: orphan.length,
    ids: tools.map((t) => t.id),
    byCategory: [...byCategory.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  };
}

/** Parsea las tablas declaradas por cada archivo de esquema. */
function parseSchema(root) {
  const dir = path.join(root, "src/shared/db/schemas");
  if (!fs.existsSync(dir)) return { total: 0, byFile: [] };
  const byFile = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".ts")).sort()) {
    const src = fs.readFileSync(path.join(dir, file), "utf8");
    const names = [...src.matchAll(/pgTable\(\s*["'`]([a-z0-9_]+)["'`]/gi)].map((m) => m[1]);
    if (names.length) byFile.push({ file, count: names.length, names });
  }
  const total = byFile.reduce((a, f) => a + f.count, 0);
  return { total, byFile };
}

function parseRoutes(root) {
  const base = path.join(root, "src/app/api");
  const files = walk(base).filter((f) => /route\.tsx?$/.test(f));
  const byDomain = new Map();
  for (const f of files) {
    const relPath = path.relative(base, f).split(path.sep).join("/");
    const domain = relPath.includes("/") ? relPath.split("/")[0] : "(raíz)";
    byDomain.set(domain, (byDomain.get(domain) || 0) + 1);
  }
  return {
    total: files.length,
    domains: [...byDomain.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  };
}

function parseTriggers(root) {
  const dir = path.join(root, "src/trigger");
  if (!fs.existsSync(dir)) return { files: 0, tasks: 0, crons: 0, schedules: [] };
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".trigger.ts")).sort();
  let tasks = 0;
  let crons = 0;
  const schedules = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    tasks += count(src, /\btask\(\{/g);
    const found = [...src.matchAll(/cron:\s*"([^"]+)"/g)].map((m) => m[1]);
    crons += found.length;
    schedules.push(...found);
  }
  return { files: files.length, tasks, crons, schedules };
}

function parseJournal(root) {
  const journal = path.join(root, "drizzle/meta/_journal.json");
  if (!fs.existsSync(journal)) return 0;
  try {
    return JSON.parse(fs.readFileSync(journal, "utf8")).entries.length;
  } catch {
    return 0;
  }
}

/** Versiones reales del stack desde package.json (sin escribir cifras a mano). */
function parseStack(root) {
  const pkgPath = path.join(root, "package.json");
  if (!fs.existsSync(pkgPath)) return {};
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const all = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  return {
    next: all.next,
    react: all.react,
    drizzle: all["drizzle-orm"],
    trigger: all["@trigger.dev/sdk"],
    zod: all.zod,
    nextIntl: all["next-intl"],
    tailwind: all.tailwindcss,
    vitest: all.vitest,
    playwright: all["@playwright/test"],
    typescript: all.typescript,
  };
}

/** Aplicaciones de `"use server"` y artefactos PWA, para la lámina de framework. */
function parseRuntimeSurface(root) {
  const appFiles = walk(path.join(root, "src/app"));
  return {
    serverActions: appFiles.filter((f) => fs.readFileSync(f, "utf8").includes('"use server"')).length,
    serviceWorker: fs.existsSync(path.join(root, "public/sw.js")),
    manifest: fs.existsSync(path.join(root, "public/manifest.json")),
    proxy: fs.existsSync(path.join(root, "src/proxy.ts")) || fs.existsSync(path.join(root, "src/middleware.ts")),
  };
}

function gitCommit(root) {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "sin git";
  }
}

/** Dominios y tablas que las láminas dibujan explícitamente. */
const ATLAS_DOMAINS = ["intelligence", "public", "security", "projects", "ai"];
const ATLAS_TABLES = [
  "users", "projects", "audits", "monitoring_schedules", "keyword_targets", "integrations",
  "intelligence_investigations", "intelligence_tool_runs", "intelligence_findings", "intelligence_assets",
  "dns_history", "whois_history", "intelligence_run_events",
  "developer_api_keys", "security_audit_logs", "siem_alert_logs", "webhook_configs", "push_subscriptions",
  "plugin_instances", "ai_usage", "ai_health_logs", "reports", "ai_report_jobs", "remediation_actions",
  "scan_queue", "scan_queue_slots", "outbox_events", "adversary_runs", "audit_rules", "project_audit_rules",
  "anomaly_detections", "uptime_logs", "web_vitals_logs", "app_logs", "audit_logs", "user_logs",
];

/**
 * El atlas dibuja entidades y dominios concretos. Si el código los renombra o
 * los borra, el build falla en vez de publicar una lámina que ya no es cierta.
 */
export function assertAtlasContracts(m) {
  const domains = new Set(m.routes.domains.map((d) => d.name));
  const missingDomains = ATLAS_DOMAINS.filter((d) => !domains.has(d));
  const tables = new Set(m.db.tables.byFile.flatMap((f) => f.names));
  const missingTables = ATLAS_TABLES.filter((t) => !tables.has(t));
  if (missingDomains.length || missingTables.length) {
    const parts = [];
    if (missingDomains.length) parts.push(`dominios: ${missingDomains.join(", ")}`);
    if (missingTables.length) parts.push(`tablas: ${missingTables.join(", ")}`);
    throw new Error(
      `[cad-atlas] el atlas dibuja elementos que ya no existen en el código → ${parts.join(" | ")}. ` +
        "Actualiza la lámina 02 (capas) o la 05 (ERD) antes de regenerar.",
    );
  }
}

export function introspect(root) {
  const schema = parseSchema(root);
  const routes = parseRoutes(root);
  const triggers = parseTriggers(root);
  const tools = parseTools(root);

  const appFiles = walk(path.join(root, "src/app"));
  const executorsDir = path.join(root, "src/server/intelligence/executors");
  const executorFiles = fs.existsSync(executorsDir)
    ? fs.readdirSync(executorsDir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    : [];

  const migrations = fs.existsSync(path.join(root, "drizzle"))
    ? fs.readdirSync(path.join(root, "drizzle")).filter((f) => f.endsWith(".sql")).length
    : 0;

  const srcFiles = walk(path.join(root, "src")).filter((f) => /\.tsx?$/.test(f)).length;
  const tests = walk(root).filter((f) => /\.(test|spec)\.tsx?$/.test(f)).length;

  const m = {
    date: new Date().toISOString().slice(0, 10),
    commit: gitCommit(root),
    routes,
    pages: {
      total: appFiles.filter((f) => /page\.tsx$/.test(f)).length,
      layouts: appFiles.filter((f) => /layout\.tsx$/.test(f)).length,
    },
    db: {
      tables: schema,
      migrations,
      journal: parseJournal(root),
    },
    triggers,
    tools,
    executors: { modules: executorFiles.length, files: executorFiles.map((f) => f.replace(/\.ts$/, "")) },
    code: { srcFiles, tests },
    stack: parseStack(root),
    surface: parseRuntimeSurface(root),
  };

  // Fail-closed: un atlas con cifras en cero es peor que no generar nada.
  const problems = [];
  if (!m.routes.total) problems.push("route handlers");
  if (!m.pages.total) problems.push("páginas");
  if (!m.db.tables.total) problems.push("tablas pgTable");
  if (!m.tools.total) problems.push("tools del registro");
  if (!m.triggers.files) problems.push("archivos .trigger.ts");
  if (problems.length) {
    throw new Error(`[cad-atlas] introspección incompleta: ${problems.join(", ")}. Revisa las rutas del repositorio.`);
  }

  return m;
}
