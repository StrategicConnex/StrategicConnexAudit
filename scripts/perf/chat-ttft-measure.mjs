#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT — Medición del TTFT del copilot con reparto por fases (TD-28).

   POR QUÉ EXISTE
   La sesión del 2026-10-30 midió el TTFT sólo desde el cliente y el reparto
   posterior se hizo emparejando filas de `ai_usage` POR ORDEN, lo que no es
   fiable: en esa ventana había 5 filas para 7 turnos, así que cualquier
   atribución habría sido un reparto inventado. Este harness elimina la
   ambigüedad por dos vías independientes:

     1. `Server-Timing` en la respuesta SSE (fases: quota, body, ctx, suggest,
        prompt, router). Se lee del mismo turno, sin emparejar nada.
     2. la fila de `ai_usage` escrita por ESE turno, localizada por ventana
        temporal [inicio, fin + margen] — nunca por índice.

   El residuo que no cubre ninguna de las dos (auth + rate limit + red del
   cliente) se calcula por resta y se reporta como tal, no se reparte.

   QUÉ MIDE
     · ttft_cliente  = envío → primer delta recibido (lo que percibe el usuario)
     · fases pre     = suma de quota+body+ctx+suggest+prompt (servidor)
     · router        = inicio del router → primer delta (servidor)
     · no atribuido  = ttft_cliente − fases pre − router

   Uso:
     node scripts/perf/chat-ttft-measure.mjs --base http://127.0.0.1:3000 --n 10
     node scripts/perf/chat-ttft-measure.mjs --base https://scaudit.vercel.app --n 10 --json
     node scripts/perf/chat-ttft-measure.mjs --n 10 --no-context   # sin contexto RLS

   Requiere en .env.local: NEXT_PUBLIC_SUPABASE_URL, la clave publicable y
   TEST_AUTH_EMAIL/TEST_AUTH_PASSWORD (misma sesión que la auditoría de campo).
   La lectura de `ai_usage` es opcional: sin DIRECT_URL/DATABASE_URL se omite.

   SOLO LEE de la BD. Las escrituras son las del propio copilot (ai_usage, y
   app_logs si hay citas no verificadas), igual que cualquier turno real.

   Exit codes: 0 medición completa · 1 hubo turnos fallidos (se reportan) ·
               2 no se pudo autenticar o no hay credenciales.
   ═══════════════════════════════════════════════════════════════════════ */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const flag = (name) => process.argv.includes(name);
const AS_JSON = flag("--json");
const BASE = arg("--base", "http://127.0.0.1:3000");
const N = Number(arg("--n", "10"));
const GAP_MS = Number(arg("--gap", "13000"));
const NO_CONTEXT = flag("--no-context");
// Sin esto, repetir la corrida mide la CACHÉ SEMÁNTICA y no el modelo: el
// router responde en ~0 ms y el TTFT baja por razones que no son latencia.
const UNIQUE = flag("--unique");
const NONCE = Math.random().toString(36).slice(2, 8);
const OUT = arg("--out", null);
// Investigación de la cuenta de smoke usada en la auditoría de campo; el
// projectId se resuelve desde la BD para no fijar un UUID a mano.
const INVESTIGATION_ID = arg("--investigation-id", "fe97e379-2d12-44c5-9d8f-3d036d2862be");

// ── .env.local ──────────────────────────────────────────────────────────
const envPath = path.join(ROOT, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL = process.env.TEST_AUTH_EMAIL;
const PASS = process.env.TEST_AUTH_PASSWORD;
if (!SUPA || !ANON || !EMAIL || !PASS) {
  console.error("❌ Faltan NEXT_PUBLIC_SUPABASE_URL / clave publicable / TEST_AUTH_EMAIL / TEST_AUTH_PASSWORD");
  process.exit(2);
}

const median = (values) => {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};
const summary = (values) => {
  const clean = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (clean.length === 0) return { n: 0, p50: null, min: null, max: null };
  return {
    n: clean.length,
    p50: median(clean),
    min: Math.min(...clean),
    max: Math.max(...clean),
  };
};

// ── 1. Auth (mismo mecanismo que scripts/audit-chat-prod.mjs) ───────────
const authRes = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: ANON },
  body: JSON.stringify({ email: EMAIL, password: PASS }),
});
const auth = await authRes.json();
if (!auth.access_token) {
  console.error(`❌ Auth falló: ${JSON.stringify(auth).slice(0, 200)}`);
  process.exit(2);
}
const projectRef = new URL(SUPA).hostname.split(".")[0];
const cookieName = `sb-${projectRef}-auth-token`;
const session = {
  access_token: auth.access_token,
  token_type: auth.token_type || "bearer",
  expires_at: auth.expires_at,
  expires_in: auth.expires_in,
  refresh_token: auth.refresh_token,
  user: auth.user,
};
const cookie = `${cookieName}=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}; disclaimer_accepted=true`;

// ── 2. Contexto (projectId resuelto por BD, no a mano) ──────────────────
let intelligenceContext;
if (!NO_CONTEXT) {
  let projectId = arg("--project-id", null);
  const dbUrl = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").split("\\$").join("$");
  if (!projectId && dbUrl) {
    try {
      const pg = (await import("pg")).default;
      const { connectionFor } = await import("../lib/db-connection.mjs");
      const client = new pg.Client(connectionFor(dbUrl));
      await client.connect();
      const { rows } = await client.query(
        "SELECT project_id FROM intelligence_investigations WHERE id = $1",
        [INVESTIGATION_ID],
      );
      projectId = rows[0]?.project_id ?? null;
      await client.end().catch(() => {});
    } catch {
      // Sin BD se sigue sin contexto: el turno sigue midiendo, sólo más ligero.
    }
  }
  if (projectId) {
    intelligenceContext = { projectId, investigationId: INVESTIGATION_ID };
  } else {
    console.warn("⚠️  Sin projectId resoluble: se mide sin contexto RLS (fase ctx ≈ 0).");
  }
}

// ── 3. Turnos ───────────────────────────────────────────────────────────
const QUESTIONS = [
  "¿Qué debería priorizar esta semana?",
  "Dame un plan de remediación paso a paso.",
  "Explica en 5 bullets qué es DMARC y cómo verificarlo.",
  "¿Qué puertos abiertos tengo en mi dominio?",
  "¿Cuáles son mis hallazgos críticos abiertos?",
  "¿Qué hago primero si tengo poco tiempo?",
  "Resume el riesgo principal de mi superficie actual.",
  "¿Cómo verifico si mi TLS está bien configurado?",
  "¿Qué diferencia hay entre un hallazgo alto y uno crítico?",
  "Propón tres comprobaciones rápidas para hoy.",
  "¿Qué evidencia debo adjuntar al cerrar un hallazgo?",
  "Explica el impacto de una cabecera CSP ausente.",
];

const turns = [];
let authFailures = 0;

for (let i = 0; i < N; i++) {
  const question = UNIQUE
    ? `${QUESTIONS[i % QUESTIONS.length]} [ref ${NONCE}-${i + 1}]`
    : `${QUESTIONS[i % QUESTIONS.length]} (turno ${i + 1})`;
  const payload = {
    messages: [{ role: "user", content: question }],
    mode: "copilot",
    stream: true,
    ...(intelligenceContext ? { intelligenceContext } : {}),
  };

  const turnStart = Date.now();
  const record = {
    turn: i + 1,
    question,
    startedAt: new Date(turnStart).toISOString(),
    status: null,
    ttftClientMs: null,
    totalMs: null,
    phases: null,
    phasesSumMs: null,
    routerMs: null,
    unattributedMs: null,
    chunks: 0,
    unverifiedCount: null,
    modelUsed: null,
    error: null,
  };

  try {
    const res = await fetch(`${BASE}/api/ai/copilot`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(payload),
    });
    record.status = res.status;

    const timingHeader = res.headers.get("server-timing");
    if (timingHeader) {
      const phases = {};
      for (const part of timingHeader.split(",")) {
        const m = part.match(/^\s*([a-zA-Z]+);dur=(\d+)/);
        if (m) phases[m[1]] = Number(m[2]);
      }
      record.phases = phases;
      const pre = ["quota", "body", "ctx", "suggest", "prompt"].reduce(
        (sum, key) => sum + (phases[key] ?? 0),
        0,
      );
      record.phasesSumMs = pre;
      record.routerMs = typeof phases.router === "number" ? phases.router : null;
    }

    if (res.status === 429) {
      record.error = "429 rate limit";
      authFailures++;
      turns.push(record);
      await new Promise((r) => setTimeout(r, 20000));
      continue;
    }

    if (!res.body) throw new Error(`sin body (status ${res.status})`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let firstChunkAt = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (firstChunkAt === null && value && value.length > 0) {
        // Primeros bytes del SSE. El primer `data:` con type chunk/done marca
        // el instante en que el usuario ve algo; se confirma abajo al parsear.
        buffer += decoder.decode(value, { stream: true });
        if (buffer.includes("data: ")) firstChunkAt = Date.now();
      } else {
        buffer += decoder.decode(value, { stream: true });
        if (buffer.includes("data: ") && firstChunkAt === null) firstChunkAt = Date.now();
      }

      let idx;
      let parsedAny = false;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const raw = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 2);
        if (!raw.startsWith("data: ")) continue;
        let event;
        try {
          event = JSON.parse(raw.slice(6));
        } catch {
          continue;
        }
        parsedAny = true;
        if (event.type === "chunk") {
          record.chunks++;
          if (record.ttftClientMs === null) {
            record.ttftClientMs = (firstChunkAt ?? Date.now()) - turnStart;
          }
        } else if (event.type === "done") {
          record.unverifiedCount = event.unverifiedCount ?? 0;
          record.modelUsed = event.modelUsed ?? null;
          record.fromCache = event.fromCache === true;
        } else if (event.type === "error") {
          record.error = String(event.message ?? "error").slice(0, 200);
        }
      }
      void parsedAny;
    }
    record.totalMs = Date.now() - turnStart;
    // `firstChunkAt` de los bytes ≠ chunk parseado: si el TTFT quedó sin
    // fijar fue una respuesta sin chunks (JSON de fallo con otro Content-Type).
    if (record.ttftClientMs === null && record.totalMs !== null) {
      record.ttftClientMs = record.totalMs;
      record.error = record.error ?? "sin chunks (respuesta no streaming)";
    }
    if (record.ttftClientMs !== null && record.phasesSumMs !== null && record.routerMs !== null) {
      record.unattributedMs = record.ttftClientMs - record.phasesSumMs - record.routerMs;
    }
  } catch (err) {
    record.error = err instanceof Error ? err.message : String(err);
    authFailures++;
  }

  turns.push(record);
  if (!AS_JSON) {
    const p = record.phases
      ? `pre ${record.phasesSumMs} (q${record.phases.quota}/b${record.phases.body}/c${record.phases.ctx}/s${record.phases.suggest}/p${record.phases.prompt}) · router ${record.routerMs}`
      : "sin Server-Timing";
    console.log(
      `turno ${String(record.turn).padStart(2)}/${N}  ${String(record.status ?? "—").padStart(3)}  ` +
        `ttft ${String(record.ttftClientMs ?? "—").padStart(5)} ms  ·  ${p}` +
        (record.error ? `  ⚠️ ${record.error}` : ""),
    );
  }
  if (i < N - 1) await new Promise((r) => setTimeout(r, GAP_MS));
}

// ── 4. Cruce con ai_usage (por ventana temporal, nunca por índice) ──────
const dbUrl = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").split("\\$").join("$");
if (dbUrl) {
  try {
    const pg = (await import("pg")).default;
    const { connectionFor } = await import("../lib/db-connection.mjs");
    const client = new pg.Client(connectionFor(dbUrl));
    await client.connect();
    for (const turn of turns) {
      const start = new Date(Date.parse(turn.startedAt) - 2000).toISOString();
      const end = new Date(Date.parse(turn.startedAt) + (turn.totalMs ?? 0) + 5000).toISOString();
      const { rows } = await client.query(
        `SELECT ttft_ms, latency_ms, model_used, streamed
           FROM ai_usage
          WHERE task_type = 'general-chat'
            AND created_at >= $1 AND created_at <= $2
          ORDER BY created_at ASC
          LIMIT 1`,
        [start, end],
      );
      if (rows[0]) {
        turn.dbTtftMs = rows[0].ttft_ms === null ? null : Number(rows[0].ttft_ms);
        turn.dbLatencyMs = rows[0].latency_ms === null ? null : Number(rows[0].latency_ms);
        turn.dbModelUsed = rows[0].model_used;
        turn.dbStreamed = rows[0].streamed;
        if (turn.routerMs === null && turn.dbTtftMs !== null) turn.routerMs = turn.dbTtftMs;
      } else {
        turn.dbTtftMs = null;
      }
    }
    await client.end().catch(() => {});
  } catch (err) {
    console.warn(`⚠️  No se pudo cruzar con ai_usage: ${err instanceof Error ? err.message : err}`);
  }
}

// ── 5. Resumen ──────────────────────────────────────────────────────────
const ok = turns.filter((t) => t.status === 200 && t.ttftClientMs !== null);
// Un acierto de caché no mide al modelo: mezclarlo con los turnos reales
// promedia dos cosas distintas. Se reporta aparte y se excluye del reparto.
const measured = ok.filter((t) => t.fromCache !== true);
const cacheHits = ok.length - measured.length;
const stats = {
  client: summary(measured.map((t) => t.ttftClientMs)),
  pre: summary(measured.map((t) => t.phasesSumMs)),
  router: summary(measured.map((t) => t.routerMs)),
  unattributed: summary(measured.map((t) => t.unattributedMs)),
};
const phases = ["quota", "body", "ctx", "suggest", "prompt"].map((key) => ({
  phase: key,
  ...summary(measured.map((t) => (t.phases ? t.phases[key] : null))),
}));
const dominant = phases
  .filter((p) => p.p50 !== null)
  .sort((a, b) => (b.p50 ?? 0) - (a.p50 ?? 0))[0];

const result = {
  base: BASE,
  turns: N,
  succeeded: ok.length,
  measured: measured.length,
  cacheHits,
  failed: turns.length - ok.length,
  stats,
  phases,
  dominantPhase: dominant ? { phase: dominant.phase, p50: dominant.p50, share: dominant.p50 && stats.pre.p50 ? Math.round((dominant.p50 / stats.pre.p50) * 100) : null } : null,
  perTurn: turns,
};

if (OUT) fs.writeFileSync(path.resolve(ROOT, OUT), JSON.stringify(result, null, 2));

if (AS_JSON) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`\n── Resumen (${ok.length}/${N} válidos · ${measured.length} medidos · ${cacheHits} de caché) ──`);
  console.log(`TTFT cliente      p50 ${stats.client.p50 ?? "—"} ms  (${stats.client.min ?? "—"}–${stats.client.max ?? "—"})`);
  console.log(`  pre-router      p50 ${stats.pre.p50 ?? "—"} ms`);
  for (const p of phases) {
    console.log(`    ${p.phase.padEnd(9)}     p50 ${p.p50 ?? "—"} ms  (${p.min ?? "—"}–${p.max ?? "—"})`);
  }
  console.log(`  router          p50 ${stats.router.p50 ?? "—"} ms`);
  console.log(`  no atribuido    p50 ${stats.unattributed.p50 ?? "—"} ms  (auth + rate limit + red)`);
  if (dominant) console.log(`\nFase dominante del pre-router: ${dominant.phase} (${dominant.p50} ms)`);
  if (turns.length - ok.length > 0) console.log(`\n⚠️  ${turns.length - ok.length} turno(s) fallidos o no streaming.`);
  if (stats.pre.n === 0) console.log(`\nNota: sin Server-Timing esta base no tiene la instrumentación (falta desplegar).`);
}

process.exit(turns.length - ok.length > 0 ? 1 : 0);
