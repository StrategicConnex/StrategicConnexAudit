// lcp-profile.mjs — Perfilado del hilo principal del dashboard (REQ-002, Paso 1).
//
// `lcp-diag.mjs` mide CUÁNDO ocurre el LCP; esto mide QUIÉN se lo come. Bajo el
// perfil `mobile` (CPU 4× + Slow 4G) el LCP de `/` sube a 3,3 s con 3,7-4,4 s de
// long tasks y TTFB prácticamente igual al de escritorio, así que la hipótesis a
// verificar es trabajo de hilo principal, no red.
//
// Captura tres vistas del mismo problema:
//   1. CPU profile (CDP Profiler) agregado por tiempo propio (`self time`) por
//      función y por fichero → señala el código responsable.
//   2. Long tasks con su atribución nativa (`attribution[].containerSrc`) →
//      señala el script que las provoca y cuándo.
//   3. Métricas de rendimiento del renderer (ScriptDuration, LayoutDuration,
//      RecalcStyleDuration, TaskDuration) → reparte el tiempo por categoría.
//
// Uso: LCP_PROFILE=mobile node scripts/e2e/lcp-profile.mjs  (JSON en stdout)
// No escribe nada más que las filas del beacon, que van marcadas `synthetic`.
//
// ADVERTENCIA (verificada 2026-10-30): el muestreo del profiler encarece el
// hilo principal, así que los tiempos de reloj que salen de aquí están
// INFLADOS — en la primera corrida midió LCP 5 644 ms donde el harness sin
// profiler daba 2 680–3 352 ms. Este script sirve para REPARTIR el coste de CPU
// entre funciones y ficheros; nunca para números de gate. Para el gate, usar
// `lcp-diag.mjs`.
import fs from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.AUDIT_BASE_URL || "https://scaudit.vercel.app";
const PROFILE = (process.env.LCP_PROFILE || "mobile").toLowerCase() === "mobile" ? "mobile" : "desktop";
const SETTLE_MS = Number(process.env.LCP_SETTLE_MS || 5000);

// ── Sesión real (mismo patrón que lcp-diag.mjs) ────────────────────────────
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL = env.TEST_AUTH_EMAIL || "smoke-test@strategicconnex.test";
const PASS = env.TEST_AUTH_PASSWORD || "Smoke2026!Playwright";
const HOST = new URL(BASE).hostname;

const authRes = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: KEY },
  body: JSON.stringify({ email: EMAIL, password: PASS }),
});
const auth = await authRes.json();
if (!auth.access_token) throw new Error("Auth failed: " + JSON.stringify(auth).slice(0, 300));
const ref = new URL(SUPA).hostname.split(".")[0];
const cookieName = `sb-${ref}-auth-token`;
const cookieValue = "base64-" + Buffer.from(JSON.stringify({
  access_token: auth.access_token,
  token_type: auth.token_type || "bearer",
  expires_at: auth.expires_at,
  expires_in: auth.expires_in,
  refresh_token: auth.refresh_token,
  user: auth.user,
})).toString("base64url");

// ── Observadores: LCP, paints y long tasks CON atribución ─────────────────
const OBSERVERS = `
  window.__p = { paints: [], lcp: null, longTasks: [] };
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__p.paints.push({ name: e.name, t: Math.round(e.startTime) });
  }).observe({ type: "paint", buffered: true });
  new PerformanceObserver((l) => {
    const e = l.getEntries().at(-1);
    const el = e && e.element;
    window.__p.lcp = { t: Math.round(e.startTime), size: e.size, tag: el ? el.tagName : null,
      cls: el ? String(el.className).slice(0, 100) : null };
  }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      window.__p.longTasks.push({
        start: Math.round(e.startTime), dur: Math.round(e.duration),
        attribution: (e.attribution || []).map((a) => ({
          name: a.name, containerSrc: a.containerSrc, containerType: a.containerType,
        })),
      });
    }
  }).observe({ type: "longtask", buffered: true });
`;
const SYNTHETIC_INIT = `window.__scauditSynthetic = true; window.__scauditSyntheticProfile = ${JSON.stringify(PROFILE)};`;

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext();
await ctx.addCookies([
  { name: cookieName, value: cookieValue, domain: HOST, path: "/" },
  { name: "disclaimer_accepted", value: "true", domain: HOST, path: "/" },
]);
await ctx.addInitScript(OBSERVERS);
await ctx.addInitScript(SYNTHETIC_INIT);
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);

if (PROFILE === "mobile") {
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false, latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await page.setViewportSize({ width: 412, height: 915 });
}

await cdp.send("Performance.enable");
await cdp.send("Profiler.enable");
// 300 µs: resolución suficiente para separar funciones cortas de hidratación
// sin generar un perfil inmanejable.
await cdp.send("Profiler.setSamplingInterval", { interval: 300 });
await cdp.send("Profiler.start");

await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 60_000 });
await page.waitForTimeout(SETTLE_MS);

const { profile } = await cdp.send("Profiler.stop");
const { metrics } = await cdp.send("Performance.getMetrics");
const data = await page.evaluate(() => ({
  ...window.__p,
  nav: (() => {
    const n = performance.getEntriesByType("navigation")[0];
    return { ttfb: Math.round(n.responseStart), responseEnd: Math.round(n.responseEnd),
      domContentLoaded: Math.round(n.domContentLoadedEventEnd), loadEvent: Math.round(n.loadEventEnd) };
  })(),
  scripts: performance.getEntriesByType("resource")
    .filter((r) => r.initiatorType === "script" || /_next\/static/.test(r.name))
    .map((r) => ({ file: r.name.split("/").pop().slice(0, 60),
      start: Math.round(r.startTime), end: Math.round(r.responseEnd), size: r.transferSize }))
    .sort((a, b) => a.start - b.start),
}));
await ctx.close();
await browser.close();

// ── Agregado del perfil: self time por función y por fichero ──────────────
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const selfByFn = new Map();
const selfByFile = new Map();
let totalSelf = 0;
for (let i = 0; i < profile.samples.length; i++) {
  const node = byId.get(profile.samples[i]);
  if (!node) continue;
  const ms = (profile.timeDeltas[i] || 0) / 1000;
  totalSelf += ms;
  const cf = node.callFrame || {};
  const url = cf.url || "(nativo)";
  const file = url ? url.split("/").pop().split("?")[0] : "(nativo)";
  const fn = cf.functionName || "(anónima)";
  const kf = `${fn} @ ${file}:${cf.lineNumber ?? "?"}`;
  selfByFn.set(kf, (selfByFn.get(kf) || 0) + ms);
  selfByFile.set(file, (selfByFile.get(file) || 0) + ms);
}
const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
  .map(([name, ms]) => ({ name, ms: Math.round(ms) }));

const metricMap = Object.fromEntries(metrics.map((m) => [m.name, m.value]));
const METRIC_KEYS = ["TaskDuration", "ScriptDuration", "LayoutDuration", "RecalcStyleDuration",
  "LayoutCount", "RecalcStyleCount", "JSHeapUsedSize", "Nodes", "Documents"];

const longTasks = data.longTasks || [];
const sumLong = longTasks.reduce((s, t) => s + t.dur, 0);

console.log(JSON.stringify({
  base: BASE,
  at: new Date().toISOString(),
  profile: PROFILE,
  settleMs: SETTLE_MS,
  lcp: data.lcp,
  paints: data.paints,
  nav: data.nav,
  longTasks: {
    count: longTasks.length,
    totalMs: sumLong,
    beforeLcpMs: longTasks.filter((t) => t.start < (data.lcp?.t ?? 0)).reduce((s, t) => s + t.dur, 0),
    list: longTasks,
  },
  rendererMetrics: Object.fromEntries(METRIC_KEYS.filter((k) => k in metricMap).map((k) => [k, Math.round(metricMap[k])])),
  cpu: {
    sampledMs: Math.round(totalSelf),
    topFunctions: top(selfByFn, 20),
    topFiles: top(selfByFile, 12),
  },
  scripts: data.scripts,
}, null, 2));
