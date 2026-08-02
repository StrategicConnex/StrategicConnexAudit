#!/usr/bin/env node
/**
 * verify-upstash.mjs — Verifica que el rate limiting distribuido de Upstash
 * Redis está operativo (no solo configurado).
 *
 * Uso:
 *   npx tsx scripts/verify-upstash.mjs
 *   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... npx tsx scripts/verify-upstash.mjs
 *
 * Checks:
 *   1. PING REST → PONG
 *   2. SET + GET → valores idénticos
 *   3. INCR atómico → contador incrementando
 *   4. TTL con EXPIRE → TTL > 0
 *   5. Limpieza de la clave de prueba → 1
 *
 * Salida: REDIS_DISTRIBUIDO_OK (exit 0) o REDIS_CAIDO (exit 1).
 */
import { readFileSync } from "node:fs";

// Carga .env.local como fallback (npx tsx no lo autoloada)
function loadDotEnv(path) {
  try {
    const content = readFileSync(path, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}
loadDotEnv(".env.local");
loadDotEnv(".env.test");

const url = process.env.UPSTASH_REDIS_REST_URL || "";
const token = process.env.UPSTASH_REDIS_REST_TOKEN || "";

if (!url || !token) {
  console.error("❌ Faltan UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN");
  process.exit(1);
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function cmd(parts, body) {
  const res = await fetch(`${url}/${parts.join("/")}`, {
    method: body !== undefined ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

const KEY = "scaudit:verify:" + Math.random().toString(36).slice(2, 8);

try {
  // 1. PING
  try {
    const ping = await cmd(["ping"]);
    check("PING REST", ping.result === "PONG", JSON.stringify(ping));
  } catch (e) {
    check("PING REST", false, String(e.message || e));
  }

  // 2. SET + GET
  try {
    const value = `hello-${Date.now()}`;
    await cmd(["set", KEY, value]);
    const got = await cmd(["get", KEY]);
    check("SET + GET", got.result === value, `roundtrip ${value.length} chars`);
  } catch (e) {
    check("SET + GET", false, String(e.message || e));
  }

  // 3. INCR atómico
  try {
    await cmd(["del", KEY + ":incr"]);
    await cmd(["incr", KEY + ":incr"]);
    await cmd(["incr", KEY + ":incr"]);
    const n = await cmd(["get", KEY + ":incr"]);
    check("INCR atómico", Number(n.result) === 2, `contador=${n.result}`);
  } catch (e) {
    check("INCR atómico", false, String(e.message || e));
  }

  // 4. TTL
  try {
    await cmd(["expire", KEY + ":incr", "60"]);
    const ttl = await cmd(["ttl", KEY + ":incr"]);
    check("TTL (EXPIRE)", Number(ttl.result) > 0, `ttl=${ttl.result}s`);
  } catch (e) {
    check("TTL (EXPIRE)", false, String(e.message || e));
  }

  // 5. Limpieza
  try {
    const del = await cmd(["del", KEY, KEY + ":incr"]);
    check("Limpieza de claves de prueba", Number(del.result) === 2, `deleted=${del.result}`);
  } catch (e) {
    check("Limpieza de claves de prueba", false, String(e.message || e));
  }
} catch (e) {
  console.error("\n⚠️ Error global de conexión:", e.message || e);
}

const allOk = results.every((r) => r.ok);
console.log(
  `\n${allOk ? "🟢 REDIS_DISTRIBUIDO_OK" : "🔴 REDIS_CAIDO"} — ${results.filter((r) => r.ok).length}/${results.length} checks`
);
if (!allOk) {
  console.error(
    "\n¿La DB fue eliminada? Recrea la base de datos siguiendo docs/guides/upstash-redis-recovery.md"
  );
  process.exit(1);
}
