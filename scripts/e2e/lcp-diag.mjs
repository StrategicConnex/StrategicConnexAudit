// lcp-diag.mjs — Diagnóstico de laboratorio del LCP en el dashboard de
// producción (H-10b, Paso 1). Sesión real (password grant + cookie forjada,
// mismo patrón que audit-chat-prod.mjs) y observadores buffered que capturan:
//   · paint (FCP), LCP con su elemento, long tasks, font-face y recursos.
//   · SSR: si el h2 del hero va en el HTML del servidor y cuánto tarda el
//     streaming completo del documento (time-to-last-byte).
// Uso: node scripts/e2e/lcp-diag.mjs   (salida: JSON en stdout)
//
// LCP_PROFILE=desktop|mobile — perfil declarado de la corrida. El gate REQ-002
// (v2, 2026-10-30) se cierra con corridas sintéticas reproducibles bajo un
// perfil declarado, así que el perfil tiene que viajar con la medida:
//   · desktop (default): sin throttling.
//   · mobile: CPU 4× + Slow 4G (150 ms RTT, 1,6 Mbps) + viewport 412×915 —
//     los valores de referencia de Lighthouse mobile. Cubre el sesgo de
//     TD-23c (0% de sesiones mobile en campo).
// Las filas que produce quedan marcadas `synthetic` en web_vitals_logs
// (TD-25), así no contaminan el p75 de usuarios reales.
import fs from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.AUDIT_BASE_URL || "https://scaudit.vercel.app";
const RUNS = Number(process.env.LCP_RUNS || 3);
const HOST = new URL(BASE).hostname;
const PROFILE = (process.env.LCP_PROFILE || "desktop").toLowerCase() === "mobile" ? "mobile" : "desktop";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL = env.TEST_AUTH_EMAIL || "smoke-test@strategicconnex.test";
const PASS = env.TEST_AUTH_PASSWORD || "Smoke2026!Playwright";

// ── 1. Sesión real ──────────────────────────────────────────────────────────
const authRes = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: KEY },
  body: JSON.stringify({ email: EMAIL, password: PASS }),
});
const auth = await authRes.json();
if (!auth.access_token) throw new Error("Auth failed: " + JSON.stringify(auth).slice(0, 300));
const ref = new URL(SUPA).hostname.split(".")[0];
const session = {
  access_token: auth.access_token,
  token_type: auth.token_type || "bearer",
  expires_at: auth.expires_at,
  expires_in: auth.expires_in,
  refresh_token: auth.refresh_token,
  user: auth.user,
};
const cookieName = `sb-${ref}-auth-token`;
const cookieValue = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");

// ── 2. SSR: ¿el h2 fijo va en el HTML del servidor? ¿antes que los datos? ──
// F-C (H-10b): "Nodos de Monitoreo" solo existe dentro de los paneles
// (OverviewTab, que se server-renderiza DESPUÉS de las queries con RLS), así
// que su posición en el documento marca dónde termina el shell. El h2 del LCP
// debe aparecer ANTES: eso prueba que viaja en el shell, fuera del
// <Suspense>, sin esperar ninguna query.
// Nota: el badge de count ahora se rellena en el cliente (contexto del shell),
// por eso ya no se comprueba "proyectos en monitoreo" en el HTML del servidor.
const HERO_ES = "Tu portafolio en monitoreo";
const HERO_EN = "Your portfolio under monitoring";
const t0 = performance.now();
const docRes = await fetch(`${BASE}/`, {
  headers: { Cookie: `${cookieName}=${cookieValue}; disclaimer_accepted=true` },
  redirect: "follow",
});
const docHtml = await docRes.text();
const idxHero = docHtml.includes(HERO_ES)
  ? docHtml.indexOf(HERO_ES)
  : docHtml.indexOf(HERO_EN);
const PANELS_ES = "Nodos de Monitoreo";
const PANELS_EN = "Monitoring Nodes";
const idxPaneles = docHtml.includes(PANELS_ES)
  ? docHtml.indexOf(PANELS_ES)
  : docHtml.indexOf(PANELS_EN);
const ssr = {
  finalUrl: docRes.url,
  status: docRes.status,
  totalMs: Math.round(performance.now() - t0),
  // F-C: el h2 fijo del LCP viaja en el shell…
  hasFixedHeroTitle: idxHero !== -1,
  // …y se emitió ANTES que los paneles con datos (queries con RLS).
  heroBeforeQueries: idxHero !== -1 && idxPaneles !== -1 && idxHero < idxPaneles,
  // Marcador de deploy: texto del fallback de contenido en el stream del
  // documento (F-B/F-C). true = el build nuevo ya está en prod.
  hasSkeletonText: docHtml.includes("Cargando tu portafolio"),
  htmlBytes: Buffer.byteLength(docHtml),
};

// ── 3. Observadores inyectados antes de la navegación ───────────────────────
const OBSERVERS = `
  window.__lcp = { paints: [], lcp: null, longTasks: [], fontsDone: null, cls: 0 };
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__lcp.paints.push({ name: e.name, t: Math.round(e.startTime) });
  }).observe({ type: "paint", buffered: true });
  new PerformanceObserver((l) => {
    const e = l.getEntries().at(-1);
    const el = e && e.element;
    window.__lcp.lcp = {
      t: Math.round(e.startTime),
      size: e.size,
      url: e.url || null,
      tag: el ? el.tagName : null,
      cls: el ? String(el.className).slice(0, 120) : null,
      text: el ? String(el.textContent || "").slice(0, 80) : null,
    };
  }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__lcp.longTasks.push({
      t: Math.round(e.startTime), dur: Math.round(e.duration),
    });
  }).observe({ type: "longtask", buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (e.value) window.__lcp.cls += e.value;
  }).observe({ type: "layout-shift", buffered: true });
  document.fonts.ready.then(() => {
    window.__lcp.fontsDone = Math.round(performance.now());
    window.__lcp.fontFaces = [...document.fonts].map((f) => ({
      family: f.family, weight: f.weight, status: f.status,
    }));
  });
`;

// Marca de procedencia (TD-25): sin esto, cada corrida del diagnóstico escribe
// filas indistinguibles de las de un usuario real y contamina el p75 de campo.
const SYNTHETIC_INIT = `window.__scauditSynthetic = true; window.__scauditSyntheticProfile = ${JSON.stringify(PROFILE)};`;

// ── 4. Navegaciones frías (RUNS) ────────────────────────────────────────────
const browser = await chromium.launch({ channel: "chrome" });
const runs = [];
for (let i = 0; i < RUNS; i++) {
  const ctx = await browser.newContext();
  await ctx.addCookies([
    { name: cookieName, value: cookieValue, domain: HOST, path: "/" },
    { name: "disclaimer_accepted", value: "true", domain: HOST, path: "/" },
  ]);
  await ctx.addInitScript(OBSERVERS);
  await ctx.addInitScript(SYNTHETIC_INIT);
  const page = await ctx.newPage();
  if (PROFILE === "mobile") {
    // Perfil declarado: tiene que aplicarse ANTES de la navegación.
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
    await page.setViewportSize({ width: 412, height: 915 });
  }
  const tNav = performance.now();
  await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 60_000 });
  const navMs = Math.round(performance.now() - tNav);
  // Espera a que LCP se estabilice (2 s sin updates) y fuentes listas
  await page.waitForTimeout(4_000);
  const data = await page.evaluate(() => ({
    ...window.__lcp,
    // F-C: h2 fijo + badge relleno in place tras hidratar (test de campo (b)).
    heroTitle: document.querySelector('[data-testid="hero-title"]')?.textContent ?? null,
    badgeText: document.querySelector('[data-testid="hero-count-badge"]')?.textContent ?? null,
    nav: (() => { const n = performance.getEntriesByType("navigation")[0]; return {
      ttfb: Math.round(n.responseStart), docResponseEnd: Math.round(n.responseEnd),
      domContentLoaded: Math.round(n.domContentLoadedEventEnd), loadEvent: Math.round(n.loadEventEnd),
      transferSize: n.transferSize, docDuration: Math.round(n.responseEnd - n.requestStart),
    }; })(),
    resources: (() => {
      const rs = performance.getEntriesByType("resource");
      const pick = (rx) => rs.filter((r) => rx.test(r.name)).map((r) => ({
        file: r.name.split("/").pop().slice(0, 55),
        start: Math.round(r.startTime), end: Math.round(r.responseEnd), size: r.transferSize,
      }));
      return { fonts: pick(/\.woff2?/), css: pick(/\.css/),
        jsTop: rs.filter((r) => /_next\/static/.test(r.name)).sort((a, b) => b.transferSize - a.transferSize).slice(0, 4)
          .map((r) => ({ file: r.name.split("/").pop().slice(0, 55), start: Math.round(r.startTime), end: Math.round(r.responseEnd), size: r.transferSize })) };
    })(),
  }));
  const fcp = data.paints.find((p) => p.name === "first-contentful-paint")?.t ?? null;
  runs.push({
    run: i + 1, navWallMs: navMs, fcp, lcp: data.lcp, fontsDone: data.fontsDone,
    heroTitle: data.heroTitle, badgeText: data.badgeText,
    cls: Math.round(data.cls * 1000) / 1000,
    longTasksBeforeLcp: data.longTasks.filter((t) => t.t < (data.lcp?.t ?? 0)),
    longTaskTotalMs: data.longTasks.reduce((s, t) => s + t.dur, 0),
    nav: data.nav, resources: data.resources, fontFaces: data.fontFaces,
  });
  await ctx.close();
}
await browser.close();

// ── 5. Reporte ──────────────────────────────────────────────────────────────
console.log(JSON.stringify({ base: BASE, at: new Date().toISOString(), profile: PROFILE, ssr, runs }, null, 2));
