// Auditoría del chat en producción — baseline. Solo lectura + 2 consultas IA reales.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.AUDIT_BASE_URL || "https://scaudit.vercel.app";
const OUT_DIR = process.env.AUDIT_OUT_DIR || "C:/Users/Juan/AppData/Local/Temp/opencode/chat-audit";
const COOKIE_DOMAIN = new URL(BASE).hostname;
fs.mkdirSync(OUT_DIR, { recursive: true });

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL = env.TEST_AUTH_EMAIL || "smoke-test@strategicconnex.test";
const PASS = env.TEST_AUTH_PASSWORD || "Smoke2026!Playwright";

const report = { base: BASE, startedAt: new Date().toISOString(), api: [], ui: {}, consoleErrors: [] };

// ---------- 1. Auth (password grant) ----------
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
report.auth = { user: auth.user?.email, userId: auth.user?.id, expiresIn: auth.expires_in };

// ---------- 2. API baseline ----------
async function timedFetch(label, url, opts = {}) {
  const t0 = performance.now();
  let res, text = "", err = null;
  try {
    res = await fetch(url, opts);
    text = await res.text();
  } catch (e) {
    err = String(e?.message || e);
  }
  const ms = Math.round(performance.now() - t0);
  let json = null;
  try { json = JSON.parse(text); } catch { /* noop */ }
  const entry = {
    label, url: url.replace(BASE, ""), status: res?.status ?? null, ms,
    bytes: Buffer.byteLength(text), error: err,
    success: json?.success, modelUsed: json?.modelUsed, fromCache: json?.fromCache,
    errorField: json?.error,
    textLen: typeof json?.message === "string" ? json.message.length
      : typeof json?.remediationPlan === "string" ? json.remediationPlan.length : null,
    textPreview: (json?.message || json?.remediationPlan || text || "").slice(0, 500),
    rateHeaders: res ? {
      limit: res.headers.get("ratelimit-limit") || res.headers.get("x-ratelimit-limit"),
      remaining: res.headers.get("ratelimit-remaining") || res.headers.get("x-ratelimit-remaining"),
      reset: res.headers.get("ratelimit-reset") || res.headers.get("x-ratelimit-reset"),
    } : null,
  };
  report.api.push(entry);
  return entry;
}

const cookieHeader = { Cookie: `${cookieName}=${cookieValue}; disclaimer_accepted=true` };
const jsonHeaders = { "Content-Type": "application/json", ...cookieHeader };

const UI_ONLY = process.env.UI_ONLY === "1";

if (!UI_ONLY) {
await timedFetch("ai/copilot SIN sesión", `${BASE}/api/ai/copilot`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ messages: [{ role: "user", content: "hola" }] }),
});

await timedFetch("ai/copilot #1 (panel vacío)", `${BASE}/api/ai/copilot`, {
  method: "POST", headers: jsonHeaders,
  body: JSON.stringify({
    messages: [{ role: "user", content: "Estoy viendo mi panel y no sé por dónde empezar. ¿Qué debería priorizar esta semana?" }],
    context: { projects: [], summary: { totalProjects: 0 } },
    mode: "copilot",
  }),
});

await timedFetch("ai/copilot #2 (conocimiento)", `${BASE}/api/ai/copilot`, {
  method: "POST", headers: jsonHeaders,
  body: JSON.stringify({
    messages: [{ role: "user", content: "Explica en 5 bullets qué es DMARC y cómo verificarlo con dig." }],
    context: null, mode: "copilot",
  }),
});

await timedFetch("intelligence/copilot SIN sesión", `${BASE}/api/intelligence/copilot`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ investigationId: "x" }),
});
await timedFetch("intelligence/copilot sin id (autenticado)", `${BASE}/api/intelligence/copilot`, {
  method: "POST", headers: jsonHeaders, body: JSON.stringify({}),
});
await timedFetch("intelligence/copilot id inexistente (autenticado)", `${BASE}/api/intelligence/copilot`, {
  method: "POST", headers: jsonHeaders,
  body: JSON.stringify({ investigationId: "00000000-0000-4000-8000-000000000000" }),
});
await timedFetch("ai/status", `${BASE}/api/ai/status`, { headers: cookieHeader });
await timedFetch("ai/healthcheck", `${BASE}/api/ai/healthcheck`, { headers: cookieHeader });
}

// ---------- 3. UI baseline ----------
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: "es-ES",
  timezoneId: "Europe/Madrid",
});
await ctx.addCookies([{
  name: cookieName, value: cookieValue, domain: COOKIE_DOMAIN,
  path: "/", httpOnly: true, secure: true, sameSite: "Lax",
}, {
  name: "disclaimer_accepted", value: "true", domain: COOKIE_DOMAIN,
  path: "/", httpOnly: false, secure: true, sameSite: "Lax",
}]);
const page = await ctx.newPage();
const apiCalls = [];
page.on("request", (r) => {
  const u = r.url();
  if (u.includes("/api/")) apiCalls.push({ phase: report.ui.phase || "?", method: r.method(), url: u.replace(BASE, ""), t: Date.now() });
});
page.on("response", async (r) => {
  const u = r.url();
  if (u.includes("/api/")) {
    const hit = apiCalls.find((c) => c.url === u.replace(BASE, "") && !c.status);
    if (hit) hit.status = r.status();
  }
});
page.on("console", (m) => { if (m.type() === "error") report.consoleErrors.push(m.text().slice(0, 300)); });
page.on("pageerror", (e) => report.consoleErrors.push("pageerror: " + String(e).slice(0, 300)));

const t = (ms) => Math.round(ms);

// 3.1 Dashboard + copilot flotante
report.ui.phase = "dashboard";
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(4000);
report.ui.dashboardUrl = page.url();
await page.screenshot({ path: path.join(OUT_DIR, "01-dashboard.png"), fullPage: false });

const openBtn = page.getByLabel("Abrir Strategic Copilot");
report.ui.floatingButtonVisible = await openBtn.isVisible().catch(() => false);
if (report.ui.floatingButtonVisible) {
  const t0 = Date.now();
  await openBtn.click();
  await page.waitForTimeout(600);
  report.ui.openMs = t(performance.now() - t0);
  await page.screenshot({ path: path.join(OUT_DIR, "02-copilot-open.png") });

  const panel = page.locator("div.fixed.bottom-24.right-4").last();
  report.ui.panelInitialText = (await panel.innerText().catch(() => "")).slice(0, 700);

  const input = page.getByPlaceholder(/Pregúntale al Copilot|Comandos forenses/).last();
  const canType = await input.isVisible().catch(() => false);
  report.ui.floatingInputVisible = canType;
  if (canType) {
    await input.fill("¿Qué debo priorizar esta semana?");
    const tSend = Date.now();
    const respPromise = page.waitForResponse((r) => r.url().includes("/api/ai/copilot"), { timeout: 150000 }).catch(() => null);
    await page.getByLabel("Enviar mensaje").last().click();
    const resp = await respPromise;
    if (resp) { try { await resp.finished(); } catch { /* noop */ } }
    const elapsed = t(Date.now() - tSend);
    await page.waitForTimeout(400);
    report.ui.floatingSendMs = elapsed;
    report.ui.floatingResponseStatus = resp?.status() ?? null;
    report.ui.panelAfterText = (await panel.innerText().catch(() => "")).slice(-1400);
    await page.screenshot({ path: path.join(OUT_DIR, "03-copilot-answer.png") });
    // Escape para comprobar cierre por teclado
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    report.ui.escapeCloses = await page.getByLabel("Abrir Strategic Copilot").isVisible().catch(() => false);
  }
}

// 3.2 /intelligence sidebar
report.ui.phase = "intelligence";
apiCalls.length = 0;
await page.goto(`${BASE}/intelligence`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(5000);
report.ui.intelligenceUrl = page.url();
await page.screenshot({ path: path.join(OUT_DIR, "04-intelligence.png") });
report.ui.intelligenceCallsOnLoad = [...apiCalls];

const sideInput = page.getByLabel("Pregunta al copiloto");
const sideVisible = await sideInput.isVisible().catch(() => false);
report.ui.sidebarInputVisible = sideVisible;
if (sideVisible) {
  const asideText = await page.locator("aside, [class*='sidebar'], body").first().innerText().catch(() => "");
  report.ui.sidebarInitialText = asideText.slice(0, 900);
  apiCalls.length = 0;
  await sideInput.fill("¿Qué puertos abiertos tengo en mi dominio?");
  const t0 = Date.now();
  await sideInput.press("Enter");
  await page.waitForTimeout(1600);
  report.ui.sidebarReplyMs = t(Date.now() - t0);
  report.ui.sidebarChatCalls = apiCalls.filter((c) => /\/api\/(ai|intelligence\/copilot)/.test(c.url));
  report.ui.bodyAfterText = (await page.locator("body").innerText().catch(() => "")).slice(-1800);
  await page.screenshot({ path: path.join(OUT_DIR, "05-intelligence-answer.png") });
}

// 3.3 móvil (solo captura del botón flotante)
report.ui.phase = "mobile";
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 }, locale: "es-ES",
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});
await mobile.addCookies([{
  name: cookieName, value: cookieValue, domain: COOKIE_DOMAIN,
  path: "/", httpOnly: true, secure: true, sameSite: "Lax",
}, {
  name: "disclaimer_accepted", value: "true", domain: COOKIE_DOMAIN,
  path: "/", httpOnly: false, secure: true, sameSite: "Lax",
}]);
const mp = await mobile.newPage();
await mp.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => {});
await mp.waitForTimeout(3500);
report.ui.mobileFloatingVisible = await mp.getByLabel("Abrir Strategic Copilot").isVisible().catch(() => false);
await mp.screenshot({ path: path.join(OUT_DIR, "06-mobile.png") });

report.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(OUT_DIR, UI_ONLY ? "report-ui.json" : "report.json"), JSON.stringify(report, null, 2));
await browser.close();

// resumen legible
const brief = {
  auth: report.auth,
  api: report.api.map((e) => ({ label: e.label, status: e.status, ms: e.ms, bytes: e.bytes, success: e.success, modelUsed: e.modelUsed, fromCache: e.fromCache, error: e.errorField, textLen: e.textLen, preview: e.textPreview.slice(0, 160) })),
  ui: {
    dashboardUrl: report.ui.dashboardUrl,
    floatingButtonVisible: report.ui.floatingButtonVisible,
    floatingInputVisible: report.ui.floatingInputVisible,
    floatingSendMs: report.ui.floatingSendMs,
    floatingResponseStatus: report.ui.floatingResponseStatus,
    escapeCloses: report.ui.escapeCloses,
    intelligenceUrl: report.ui.intelligenceUrl,
    sidebarInputVisible: report.ui.sidebarInputVisible,
    sidebarReplyMs: report.ui.sidebarReplyMs,
    sidebarChatCalls: report.ui.sidebarChatCalls,
    mobileFloatingVisible: report.ui.mobileFloatingVisible,
  },
  consoleErrors: report.consoleErrors.slice(0, 10),
};
console.log(JSON.stringify(brief, null, 2));
