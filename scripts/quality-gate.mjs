#!/usr/bin/env node
/**
 * quality-gate.mjs — Validador de Quality Gate para documentación Enterprise.
 *
 * Lee un documento Markdown y puntúa automáticamente los 20 checks del
 * template obligatorio definido en docs/improvements/MASTER_PROMPT-v2.md
 * (PARTE 4.1 — Quality Gate): 20 items × 5 pts = 100.
 *
 * Uso:
 *   node .freebuff/quality-gate.mjs <archivo.md> [--min 80] [--json] [--quiet]
 *
 *   --min N   umbral de aprobación (default 80; < 80 = FAIL, igual que el prompt)
 *   --json    salida JSON (para CI / scripts)
 *   --quiet   solo imprime la puntuación final
 *
 * Exit code: 0 si score >= umbral, 1 si FAIL (reutilizable en CI / pre-commit).
 *
 * Detección: heurística de contenido (headers de sección + marcadores del
 * documento: FIG-/MAT-/FLOW-/REQ-/[UNKNOWN]/[VERIFIED]/mermaid/glosario…),
 * tolerante a español/inglés. No requiere dependencias.
 */

import { readFileSync } from "node:fs";

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
        /(?:\d+\.\d+|20\d\d[-/]\d{1,2}|\d{1,2}\/\d{1,2}\/20\d\d)/.test(text);
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

// ─── CLI ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));

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

const asJson = args.includes("--json");
const quiet = args.includes("--quiet");

if (!file) {
  console.error(
    "Uso: node .freebuff/quality-gate.mjs <archivo.md> [--min 80] [--json] [--quiet]"
  );
  process.exit(2);
}

let content;
try {
  content = readFileSync(file, "utf8");
} catch (err) {
  console.error(`❌ No se pudo leer ${file}: ${err.message}`);
  process.exit(2);
}

const lines = content.split("\n");
const headers = lines.filter((l) => /^#{1,3}\s+/.test(l));
const mermaid = extractMermaid(lines);
const text = content.toLowerCase();
const ctx = { headers, text, lines, mermaid };

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
const pass = score >= min;

if (asJson) {
  console.log(JSON.stringify({ file, score, max: 100, min, pass, checks: results }, null, 2));
} else if (quiet) {
  console.log(`${file}: ${score}/100 ${pass ? "PASS" : "FAIL (mín " + min + ")"}`);
} else {
  console.log(`\n════════ QUALITY GATE — ${file} ════════`);
  console.log(`Template: MASTER_PROMPT-v2.md §4.1 (20 items × 5 pts = 100)\n`);
  for (const r of results) {
    console.log(`${r.ok ? "✅" : "❌"}  ${String(r.id).padStart(2, "0")}. [${r.pts}/5] ${r.title}`);
  }
  console.log(`\n${"─".repeat(52)}`);
  console.log(`SCORE: ${score}/100  ·  Umbral: ${min}  ·  ${pass ? "✅ PASS" : "❌ FAIL"}`);
  if (!pass) console.log(`   → < ${min}: NO entregar (regla del MASTER PROMPT v2).`);
}

process.exit(pass ? 0 : 1);
