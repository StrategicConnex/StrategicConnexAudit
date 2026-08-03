#!/usr/bin/env node
/**
 * quality-gate.mjs — Validador de Quality Gate para documentación Enterprise.
 *
 * Lee un documento Markdown y puntúa automáticamente los 20 checks del
 * template obligatorio definido en docs/improvements/MASTER_PROMPT-v2.md
 * (PARTE 4.1 — Quality Gate): 20 items × 5 pts = 100.
 *
 * Uso:
 *   node scripts/quality-gate.mjs <archivo.md> [--min 80] [--min-dir DIR=N] [--json] [--quiet]
 *   node scripts/quality-gate.mjs --table [<dir> ...] [--min 80] [--min-dir DIR=N]
 *
 *   --min N        umbral global de aprobación (default 80; < N = FAIL)
 *   --min-dir DIR=N  umbral por directorio, repetible (ej: --min-dir docs/jobs=90).
 *                  El umbral efectivo del archivo es el MÁXIMO entre --min y los
 *                  --min-dir cuyo directorio sea prefijo de la ruta del archivo.
 *   --table        genera una tabla Markdown de scores por carpeta (docs,
 *                  PASS, promedio, mínimo, máximo y umbral) con fila TOTAL.
 *                  Sin argumentos usa las 8 carpetas técnicas por defecto.
 *   --json         salida JSON (para CI / scripts)
 *   --quiet        solo imprime la puntuación final
 *
 * Exit code: 0 si score >= umbral, 1 si FAIL (reutilizable en CI / pre-commit).
 * En modo --table siempre sale 0 (reporte informativo; el gate real es el loop
 * de archivo por archivo en CI).
 *
 * Detección: heurística de contenido (headers de sección + marcadores del
 * documento: FIG-/MAT-/FLOW-/REQ-/[UNKNOWN]/[VERIFIED]/mermaid/glosario…),
 * tolerante a español/inglés. No requiere dependencias.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ─── Config de los 20 checks (id · título · función de detección) ───────────
// Cada check vale 5 puntos. La función recibe { text, headers, lines, mermaid }
// y devuelve true/false. `headers` = líneas de sección (## / #), `text` = todo
// el contenido en minúsculas, `lines` = array crudo, `mermaid` = bloques.
const CHECKS = [
  {
    id: 1,
    title: "Scope y objetivos definidos",
    detect: ({ headers, text }) =>
      hasAny(headers, /scope|objetivos|objectives|alcance|propósito|purpose/i) ||
      /\b(scope|objetivos|objectives|alcance)\b/i.test(text),
  },
  {
    id: 2,
    title: "Requisitos documentados",
    detect: ({ headers, text }) =>
      hasAny(headers, /requisitos|requirements|requisitos funcionales|nfr/i) ||
      /\b(requisitos|requirements)\b/i.test(text),
  },
  {
    id: 3,
    title: "Arquitectura documentada (contexto → componentes → dependencias)",
    detect: ({ headers, text }) =>
      hasAny(headers, /arquitectura|architecture|system context|componentes|components|dependencias|dependencies/i) &&
      (hasAny(headers, /contexto|context|component|dependencia|dependency/i) || /(->|→)/.test(text)),
  },
  {
    id: 4,
    title: "Datos documentados (ERD + dictionary, sin columnas inventadas)",
    detect: ({ headers, text }) =>
      hasAny(headers, /datos|data|erd|esquema|schema|modelo de datos|data model/i) &&
      /\|.*\|/.test(text), // tabla de datos presente
  },
  {
    id: 5,
    title: "Flujos documentados (request/response, procesos)",
    detect: ({ headers, text }) =>
      hasAny(headers, /flujo|flujos|flow|proceso|procesos|workflow|request\/response/i) ||
      /\bflujos?\b|\bflows?\b|request\/response/i.test(text),
  },
  {
    id: 6,
    title: "APIs documentadas (método, auth, request, response, errores, rate limit)",
    detect: ({ headers, text }) =>
      hasAny(headers, /api/i) &&
      (/\b(get|post|put|patch|delete)\b/i.test(text) || /endpoint|status code|rate limit|error/i.test(text)),
  },
  {
    id: 7,
    title: "Seguridad documentada (trust boundaries, controles, amenazas)",
    detect: ({ headers, text }) =>
      hasAny(headers, /seguridad|security|threat|amenazas|trust|controles|auth/i) &&
      /threat|amenaz|trust bound|control|auth[zn]?|ssl|tls|rbac|token/i.test(text),
  },
  {
    id: 8,
    title: "Testing documentado (estrategia + casos + cobertura)",
    detect: ({ headers, text }) =>
      hasAny(headers, /testing|tests?|pruebas|cobertura|coverage|test strategy/i) &&
      /caso|cases|unit|e2e|integration|integraci|cobertura|coverage/i.test(text),
  },
  {
    id: 9,
    title: "Deployment documentado (ambientes, CI/CD, rollout)",
    detect: ({ headers, text }) =>
      hasAny(headers, /deployment|deploy|despliegue|ci\/cd|ambientes|environments|rollout/i) ||
      /ci\/cd|despliegue|rollout|ambiente|environment|vercel|docker/i.test(text),
  },
  {
    id: 10,
    title: "Operaciones documentadas (monitoring, runbooks, recovery)",
    detect: ({ headers, text }) =>
      hasAny(headers, /operacion|operation|monitoring|observabil|runbook|recovery|incidente/i) &&
      /monitoring|observabil|runbook|recovery|incidente|alert|log/i.test(text),
  },
  {
    id: 11,
    title: "Mermaid proporcionado y válido en los diagramas clave",
    detect: ({ mermaid }) =>
      mermaid.length > 0 && mermaid.every((b) => isMermaidSane(b)),
  },
  {
    id: 12,
    title: "Inventario visual creado (FIG/MAT/FLOW con metadatos)",
    detect: ({ text }) => /\b(FIG|MAT|FLOW|INV|SEQ)-\d+/i.test(text),
  },
  {
    id: 13,
    title: "Trazabilidad establecida (REQ → COMP → TEST → DEP)",
    detect: ({ headers, text }) =>
      hasAny(headers, /trazabilidad|traceability/i) &&
      /\b(REQ|CMP|COMP|TEST|DEP|MAT)-\d+/i.test(text),
  },
  {
    id: 14,
    title: "Inconsistencias detectadas y resueltas (cross-check)",
    detect: ({ text }) =>
      /inconsistenci|consistency issue|cross-check|validaci[oó]n cruzada|DOCUMENTATION CONSISTENCY/i.test(text),
  },
  {
    id: 15,
    title: "Unknowns y assumptions identificados",
    detect: ({ text }) =>
      /\[UNKNOWN\]|\[ASSUMPTION\]|\[PROPOSED\]|\[ESTIMATE\]|\[SOURCE: USER\]|supuestos|assumption|asunci[oó]n/i.test(text),
  },
  {
    id: 16,
    title: "Cero datos inventados (datos con fuente)",
    detect: ({ text }) =>
      /\[VERIFIED\]|\[USER PROVIDED\]|\[DOCUMENTED\]|\[INFERRED\]|fuente:|source:/i.test(text) ||
      /columna.*fuente|\|\s*(fuente|source)\s*\|/i.test(text),
  },
  {
    id: 17,
    title: "Diagramas legibles (sin densidad excesiva)",
    detect: ({ mermaid, text }) => {
      // Legible SOLO si hay diagramas: pocos bloques (≤8) y ninguno supera
      // ~60 líneas de densidad. Sin diagramas → no puntúa (evita freebies).
      const blocks = mermaid.length || (/\bFIG-\d+/i.test(text) ? 1 : 0);
      return blocks > 0 && blocks <= 8 && mermaid.every((b) => b.split("\n").length <= 60);
    },
  },
  {
    id: 18,
    title: "Diagramas no redundantes (IDs únicos)",
    detect: ({ text }) => {
      // No-redundancia: los IDs únicos deben ser la mayoría de las referencias.
      // Se toleran referencias repetidas al mismo ID en prosa (cross-references)
      // hasta 2x — NO se comparan primeras líneas de mermaid (casi todos los
      // flowcharts empiezan igual con `flowchart TB`, lo que daba falsos FAIL).
      const ids = [...text.matchAll(/\b(FIG|FLOW|MAT|SEQ|INV)-(\d+)/gi)].map((m) => m[0].toUpperCase());
      if (ids.length === 0) return false;
      const uniq = new Set(ids);
      return ids.length <= uniq.size * 2 + 2;
    },
  },
  {
    id: 19,
    title: "Terminología consistente (glosario si aplica)",
    detect: ({ headers, text }) =>
      hasAny(headers, /glosario|glossary|terminolog[ií]a|terminology/i) ||
      /\bGLOSSARY-\d+\b|\bGLOSARIO\b/i.test(text) ||
      /\|\s*(t[eé]rmino|term)\s*\|/i.test(text),
  },
  {
    id: 20,
    title: "Documento versionado (versión, fecha, autor, estado)",
    detect: ({ lines, text }) => {
      const top = lines.slice(0, 40).join("\n").toLowerCase();
      return /versi[oó]n|version|fecha|date|autor|author|estado|status/i.test(top) &&
        /(?:\d+\.\d+|20\d\d[-\/]\d{1,2}|\d{1,2}\/\d{1,2}\/20\d\d)/.test(text);
    },
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hasAny(arr, re) {
  return arr.some((line) => re.test(line));
}

/** Extrae bloques ```mermaid … ``` del documento. */
function extractMermaid(lines) {
  const blocks = [];
  let buf = null;
  for (const line of lines) {
    const fence = /^```/.test(line.trim());
    if (fence) {
      if (buf === null) {
        if (/^```\s*mermaid(?:$|\s)/i.test(line.trim())) buf = [];
      } else {
        if (buf.length > 0) blocks.push(buf.join("\n"));
        buf = null;
      }
      continue;
    }
    if (buf !== null) buf.push(line);
  }
  // Flush: un bloque mermaid abierto y no cerrado al final del archivo se
  // conserva (antes se descartaba silenciosamente).
  if (buf !== null && buf.length > 0) blocks.push(buf.join("\n"));
  return blocks;
}

/** Chequeo de cordura sintáctica: al menos una flecha / palabra clave de tipo. */
function isMermaidSane(block) {
  return (/(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|mindmap|timeline|architecture-beta)/i.test(block) ||
    /(-->|---|->>|==>|-.->|--\s|\.\.\.)/.test(block));
}

/** Umbral efectivo del archivo: MÁXIMO(--min, --min-dir con prefijo de ruta). */
function effectiveMinFor(filePath, baseMin, dirMins) {
  let eff = baseMin;
  let source = "global";
  const norm = filePath.replace(/\\/g, "/");
  for (const dm of dirMins) {
    if (norm === dm.dir || norm.startsWith(dm.dir + "/")) {
      if (dm.min > eff) {
        eff = dm.min;
        source = dm.dir;
      }
    }
  }
  return { min: eff, source };
}

/**
 * Puntúa un archivo .md. Devuelve null si no se puede leer.
 * Resultado: { file, score, max, min, minSource, pass, checks }.
 */
function scoreFile(filePath, baseMin, dirMins) {
  let content;
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  const lines = content.split("\n");
  const headers = lines.filter((l) => /^#{1,3}\s+/.test(l));
  const mermaid = extractMermaid(lines);
  const ctx = { headers, text: content.toLowerCase(), lines, mermaid };

  const results = CHECKS.map((c) => {
    let ok = false;
    try {
      ok = Boolean(c.detect(ctx));
    } catch {
      ok = false;
    }
    return { id: c.id, title: c.title, ok, pts: ok ? 5 : 0 };
  });

  const score = results.reduce((s, r) => s + r.pts, 0);
  const { min, source } = effectiveMinFor(filePath, baseMin, dirMins);
  return {
    file: filePath,
    score,
    max: 100,
    min,
    minSource: source,
    pass: score >= min,
    checks: results,
  };
}

const fmtNum = (x) =>
  x === null || x === undefined ? "—" : (Number.isInteger(x) ? x : x.toFixed(1));

/**
 * Genera la tabla Markdown de scores por carpeta (modo --table).
 * Columnas: Carpeta · Docs · PASS · Promedio · Mín · Máx · Umbral + fila TOTAL.
 * Los docs bajo el umbral se listan al final para que el reviewer los vea.
 */
function tableReport(dirs, baseMin, dirMins) {
  const rows = [];
  let tFiles = 0, tPass = 0, tSum = 0, tMin = null, tMax = null;
  const failing = [];

  for (const d of dirs) {
    let entries = [];
    try {
      entries = readdirSync(d).filter((f) => f.endsWith(".md")).sort();
    } catch {
      // carpeta inexistente o vacía — se omite con 0 docs
    }
    let n = 0, passN = 0, sum = 0, mn = null, mx = null;
    for (const f of entries) {
      const r = scoreFile(join(d, f).replace(/\\/g, "/"), baseMin, dirMins);
      if (!r) continue;
      n++; sum += r.score;
      mn = mn === null ? r.score : Math.min(mn, r.score);
      mx = mx === null ? r.score : Math.max(mx, r.score);
      if (r.pass) passN++;
      else failing.push(`- \`${r.file}\`: ${r.score}/100`);
    }
    // Umbral efectivo de la carpeta: MÁXIMO(--min, --min-dir con prefijo de la carpeta)
    const { min: dirMin } = effectiveMinFor(d, baseMin, dirMins);
    const avg = n > 0 ? sum / n : null;
    rows.push({ dir: d, n, passN, avg, mn, mx, dirMin });
    tFiles += n; tPass += passN; tSum += sum;
    if (mn !== null) tMin = tMin === null ? mn : Math.min(tMin, mn);
    if (mx !== null) tMax = tMax === null ? mx : Math.max(tMax, mx);
  }

  const out = [];
  out.push("| Carpeta | Docs | PASS | Promedio | Mín | Máx | Umbral |");
  out.push("|---|---|---|---|---|---|---|");
  for (const r of rows) {
    // Carpeta vacía/inexistente (sin .md en el checkout) → badge neutro "—",
    // no un falso ❌: no hay nada que validar ahí (nullglob del gate).
    const badge = r.n === 0 ? "—" : (r.passN === r.n ? "✅" : "❌");
    out.push(`| ${r.dir} | ${r.n} | ${badge} ${r.passN}/${r.n} | ${fmtNum(r.avg)} | ${fmtNum(r.mn)} | ${fmtNum(r.mx)} | ${r.dirMin} |`);
  }
  out.push(`| **TOTAL** | **${tFiles}** | **${tPass}/${tFiles}** | **${fmtNum(tFiles ? tSum / tFiles : null)}** | **${fmtNum(tMin)}** | **${fmtNum(tMax)}** | — |`);
  if (failing.length > 0) {
    out.push("");
    out.push(`**${failing.length} doc(s) bajo el umbral:**`);
    out.push(...failing);
  }
  return out.join("\n");
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

// Args posicionales (rutas): todo arg que no sea un flag ni el valor de
// --min/--min-dir. En modo archivo es un único .md; en modo --table son dirs.
const positionals = args.filter((a, i) => {
  if (a.startsWith("--")) return false;
  const prev = args[i - 1];
  return !(prev === "--min" || prev === "--min-dir");
});

// ── Parsing robusto de --min: acepta `--min 80` y `--min=80`; ante un valor
//    inválido (NaN) o no-positivo cae al default 80 en vez de romper el gate.
let min = 80;
const minEq = args.find((a) => a.startsWith("--min="));
const minIdx = args.indexOf("--min");
if (minEq) {
  const p = Number(minEq.split("=")[1]);
  if (Number.isFinite(p) && p > 0) min = p;
} else if (minIdx >= 0 && args[minIdx + 1] !== undefined) {
  const p = Number(args[minIdx + 1]);
  if (Number.isFinite(p) && p > 0) min = p;
}

// ── Parsing de --min-dir: umbral por directorio, repetible ───────────────────
//    Formato: `--min-dir <dir>=<N>` o `--min-dir=<dir>=<N>` (ej: docs/jobs=90).
//    Permite exigir más a carpetas específicas (p.ej. JOB-CONTRACT) sin subir
//    el umbral global del resto.
const dirMins = [];
{
  let i = 0;
  while (i < args.length) {
    let spec = null;
    if (args[i] === "--min-dir") {
      spec = args[i + 1];
      i += 2;
    } else if (args[i].startsWith("--min-dir=")) {
      spec = args[i].slice("--min-dir=".length);
      i += 1;
    } else {
      i += 1;
      continue;
    }
    if (!spec) continue;
    const eq = spec.lastIndexOf("=");
    if (eq <= 0) {
      console.warn(`⚠️  --min-dir ignorado: formato esperado "--min-dir <dir>=<N>" (recibido: "${spec}")`);
      continue;
    }
    const dir = spec.slice(0, eq).replace(/\\/g, "/").replace(/\/+$/, "");
    const p = Number(spec.slice(eq + 1));
    if (!dir || !Number.isFinite(p) || p <= 0) {
      console.warn(`⚠️  --min-dir ignorado: umbral inválido (recibido: "${spec}")`);
      continue;
    }
    dirMins.push({ dir, min: p });
  }
}

const asTable = args.includes("--table");
const asJson = args.includes("--json");
const quiet = args.includes("--quiet");

// Carpetas técnicas por defecto (usadas por --table sin argumentos y por CI).
const DEFAULT_DIRS = [
  "docs/architecture", "docs/database", "docs/jobs", "docs/modules",
  "docs/traceability", "docs/risk", "docs/technical-debt", "docs/testing",
];

// ── Modo tabla: reporte de scores por carpeta (siempre exit 0) ───────────────
if (asTable) {
  const dirs = positionals.length > 0 ? positionals : DEFAULT_DIRS;
  console.log(tableReport(dirs, min, dirMins));
  process.exit(0);
}

const file = positionals[0];

if (!file) {
  console.error(
    "Uso: node scripts/quality-gate.mjs <archivo.md> [--min 80] [--min-dir DIR=N] [--json] [--quiet]"
  );
  console.error(
    "     node scripts/quality-gate.mjs --table [<dir> ...] [--min 80] [--min-dir DIR=N]"
  );
  process.exit(2);
}

const result = scoreFile(file, min, dirMins);
if (!result) {
  console.error(`❌ No se pudo leer ${file}`);
  process.exit(2);
}
const { score, minSource, pass, checks } = result;

if (asJson) {
  console.log(JSON.stringify({ file, score, max: result.max, min: result.min, minSource, dirMins, pass, checks }, null, 2));
} else if (quiet) {
  const th = minSource === "global" ? `mín ${result.min}` : `mín ${result.min} (${minSource})`;
  console.log(`${file}: ${score}/100 ${pass ? "PASS (" + th + ")" : "FAIL (" + th + ")"}`);
} else {
  console.log(`\n════════ QUALITY GATE — ${file} ════════`);
  console.log(`Template: MASTER_PROMPT-v2.md §4.1 (20 items × 5 pts = 100)\n`);
  for (const r of checks) {
    console.log(`${r.ok ? "✅" : "❌"}  ${String(r.id).padStart(2, "0")}. [${r.pts}/5] ${r.title}`);
  }
  console.log(`\n${"─".repeat(52)}`);
  console.log(`SCORE: ${score}/100  ·  Umbral: ${result.min}${minSource !== "global" ? ` (${minSource})` : ""}  ·  ${pass ? "✅ PASS" : "❌ FAIL"}`);
  if (!pass) console.log(`   → < ${result.min}: NO entregar (regla del MASTER PROMPT v2).`);
}

process.exit(pass ? 0 : 1);
