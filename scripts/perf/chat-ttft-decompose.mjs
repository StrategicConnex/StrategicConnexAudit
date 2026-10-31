#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT — Descomposición del TTFT del copilot (TD-28).

   POR QUÉ EXISTE
   La sesión de campo del 2026-10-30 midió TTFT p50 3 934 ms DESDE EL CLIENTE
   (lectura incremental del SSE). Esa cifra es lo que percibe el usuario, pero
   no dice DÓNDE se va el tiempo: entre la petición y el primer token hay al
   menos dos tramos con dueños distintos y solo uno de ellos estaba medido.

     t=0 ──── pre-router ────┬── router ──┬── primer delta ──► cliente
        auth, cuota, RLS,   │  caché +   │
        construcción prompt │  proveedor │
                            └────────────┘
                             ttft_ms (ya persistido en ai_usage)

   `callAIWithFallbackStream` ya escribe `ttft_ms` = inicio del router → primer
   delta. Por tanto NO hace falta instrumentar para el primer corte: basta
   restar. El residuo (TTFT cliente − ttft_ms server) es pre-router + red, y
   ese residuo es el que decide si la optimización debe ir a las consultas
   previas (RLS del contexto, cuota) o al router (caché, proveedor).

   QUÉ HACE
     1. lee filas de `ai_usage` del task `general-chat` en la ventana pedida;
     2. las empareja por orden con los TTFT de cliente aportados (--client),
        porque la sesión del 30-oct fue secuencial y espaciada 13 s;
     3. imprime, por turno: ttft server, generación, TTFT cliente y residuo;
     4. agrega p50/min/max de cada tramo y emite un veredicto de atribución.

   SOLO LEE. Ninguna escritura, ningún DDL.

   Uso:
     node scripts/perf/chat-ttft-decompose.mjs --since 2026-10-30T14:55Z \
       --until 2026-10-30T15:15Z --client 9205,7236,3280,3934,3224,6692,3485
     node scripts/perf/chat-ttft-decompose.mjs ... --json

   Exit codes: 0 datos leídos y descompuestos · 2 sin credenciales/conexión
               o sin filas en la ventana (no se puede atribuir nada).
   ═══════════════════════════════════════════════════════════════════════ */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import pg from "pg";
import { connectionFor } from "../lib/db-connection.mjs";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const AS_JSON = process.argv.includes("--json");
const MODELS_ONLY = process.argv.includes("--models");
const SINCE = arg("--since", "2026-10-30T14:55:00Z");
const UNTIL = arg("--until", "2026-10-30T15:15:00Z");
const CLIENT_RAW = arg("--client", "");
const CLIENT = CLIENT_RAW
  ? CLIENT_RAW.split(",").map((v) => Number(v.trim())).filter((n) => Number.isFinite(n))
  : [];

// ── .env.local sin dependencias ─────────────────────────────────────────
const envPath = path.join(ROOT, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const dbUrl = (process.env.DIRECT_URL || process.env.DATABASE_URL || "").split("\\$").join("$");
if (!dbUrl) {
  console.error("❌ DIRECT_URL/DATABASE_URL no definida");
  process.exit(2);
}

const median = (values) => {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};
const stats = (values) => {
  const clean = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (clean.length === 0) return { n: 0, p50: null, min: null, max: null };
  return { n: clean.length, p50: median(clean), min: Math.min(...clean), max: Math.max(...clean) };
};

const client = new pg.Client(connectionFor(dbUrl));

try {
  await client.connect();

  const { rows } = await client.query(
    `SELECT created_at, model_used, latency_ms, ttft_ms, streamed,
            from_cache, success, user_id, tokens_in, tokens_out
       FROM ai_usage
      WHERE task_type = 'general-chat'
        AND created_at >= $1
        AND created_at <  $2
      ORDER BY created_at ASC`,
    [SINCE, UNTIL],
  );

  if (rows.length === 0) {
    console.error(
      `❌ Sin filas de ai_usage para general-chat en [${SINCE}, ${UNTIL}). ` +
        `No hay nada que descomponer: la ventana está mal o la instrumentación ` +
        `de ttft_ms aún no estaba desplegada en ese tráfico.`,
    );
    process.exit(2);
  }

  // El emparejamiento es por orden: la sesión de referencia fue secuencial
  // (espaciada 13 s por el rate limit de 5/60 s), así que la fila i-ésima por
  // created_at corresponde al turno i-ésimo del cliente.
  const turns = rows.map((row, i) => {
    const serverTtft = row.ttft_ms === null ? null : Number(row.ttft_ms);
    const latency = row.latency_ms === null ? null : Number(row.latency_ms);
    const clientTtft = CLIENT[i] ?? null;
    return {
      turn: i + 1,
      createdAt: row.created_at,
      modelUsed: row.model_used,
      fromCache: row.from_cache,
      success: row.success,
      streamed: row.streamed,
      serverTtftMs: serverTtft,
      generationMs: latency !== null && serverTtft !== null ? latency - serverTtft : null,
      clientTtftMs: clientTtft,
      // Residuo = lo que el cliente espera de más sobre el primer delta del
      // router: pre-router (auth, cuota, RLS del contexto, prompt) + red.
      residualMs: clientTtft !== null && serverTtft !== null ? clientTtft - serverTtft : null,
    };
  });

  const server = stats(turns.map((t) => t.serverTtftMs));
  const residual = stats(turns.map((t) => t.residualMs));
  const generation = stats(turns.map((t) => t.generationMs));
  const clientStats = stats(turns.map((t) => t.clientTtftMs));

  // Atribución: sólo se declara un tramo dominante si supera al otro por un
  // margen que no sea ruido. Con n pequeño el margen se exige amplio.
  let verdict = "indeterminado (faltan datos de cliente o de servidor)";
  if (server.p50 !== null && residual.p50 !== null) {
    const diff = residual.p50 - server.p50;
    if (Math.abs(diff) < 400) {
      verdict = "mixto: ningún tramo domina con margen suficiente (>400 ms)";
    } else if (diff > 0) {
      verdict = `pre-router/red domina (+${diff} ms sobre el router)`;
    } else {
      verdict = `router (caché+proveedor) domina (${-diff} ms más que el residuo)`;
    }
  }

  // Distribución de modelos: `groq:`/`gemini:` significan que el turno lo
  // sirvió el FAILOVER, no el primario de OpenRouter. Un turno así paga los
  // intentos fallidos de la cadena primaria antes del primer byte.
  if (MODELS_ONLY) {
    const byModel = new Map();
    for (const row of rows) {
      const key = row.model_used;
      const entry = byModel.get(key) ?? { model: key, n: 0, ttft: [], failover: /^(groq|gemini):/.test(key) };
      entry.n++;
      if (row.ttft_ms !== null) entry.ttft.push(Number(row.ttft_ms));
      byModel.set(key, entry);
    }
    const dist = [...byModel.values()].map((e) => ({
      model: e.model,
      n: e.n,
      share: Math.round((e.n / rows.length) * 100),
      failover: e.failover,
      ttftP50: stats(e.ttft).p50,
      ttftRange: [stats(e.ttft).min, stats(e.ttft).max],
    })).sort((a, b) => b.n - a.n);
    const failoverTurns = rows.filter((r) => /^(groq|gemini):/.test(r.model_used)).length;
    if (AS_JSON) {
      console.log(JSON.stringify({ window: { since: SINCE, until: UNTIL }, total: rows.length, failoverTurns, distribution: dist }, null, 2));
    } else {
      console.log(`\nVentana: ${SINCE} → ${UNTIL}  ·  filas: ${rows.length}\n`);
      for (const d of dist) {
        console.log(
          `${String(d.model).padEnd(32)} ${String(d.n).padStart(3)}  ${String(d.share).padStart(3)}%  ` +
            `${d.failover ? "FAILOVER" : "primario"}  ttft p50 ${d.ttftP50 ?? "—"} ms`,
        );
      }
      console.log(`\nServidos por failover: ${failoverTurns}/${rows.length} (${Math.round((failoverTurns / rows.length) * 100)}%)`);
    }
    await client.end().catch(() => {});
    process.exit(0);
  }

  if (AS_JSON) {
    console.log(JSON.stringify({ window: { since: SINCE, until: UNTIL }, turns, stats: { client: clientStats, server, residual, generation }, verdict }, null, 2));
  } else {
    console.log(`\nVentana: ${SINCE} → ${UNTIL}  ·  filas: ${rows.length}\n`);
    const pad = (v, w) => String(v ?? "—").padStart(w);
    console.log("turno  modelo                       caché  ttft_srv  generac.  ttft_cli  residuo");
    for (const t of turns) {
      console.log(
        `${pad(t.turn, 5)}  ${String(t.modelUsed).slice(0, 26).padEnd(27)} ${pad(t.fromCache ? "sí" : "no", 6)}` +
          `${pad(t.serverTtftMs, 10)}${pad(t.generationMs, 10)}${pad(t.clientTtftMs, 10)}${pad(t.residualMs, 9)}`,
      );
    }
    console.log(
      `\np50  cliente ${clientStats.p50 ?? "—"} ms  ·  router ${server.p50 ?? "—"} ms  ·  ` +
        `residuo ${residual.p50 ?? "—"} ms  ·  generación ${generation.p50 ?? "—"} ms`,
    );
    console.log(`rango router: ${server.min ?? "—"}–${server.max ?? "—"} ms  ·  residuo: ${residual.min ?? "—"}–${residual.max ?? "—"} ms`);
    console.log(`\nAtribución: ${verdict}`);
    if (turns.some((t) => t.streamed === false)) {
      console.log("\n⚠️  Hay turnos con streamed=false: sin primer delta no hay TTFT comparable.");
    }
  }
} catch (err) {
  console.error(`❌ No se pudo leer ai_usage: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 2;
} finally {
  await client.end().catch(() => {});
}
