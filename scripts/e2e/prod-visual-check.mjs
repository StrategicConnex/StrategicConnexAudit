/* ═══════════════════════════════════════════════════════════════════════
   Prueba visual del sitio en PRODUCCIÓN (https://scaudit.vercel.app)
   Captura las vistas accesibles públicamente del rediseño (semanas 1-12):
   login (desktop + mobile), pricing, docs, portal cliente (si hay token).

   Ejecutar: node scripts/e2e/prod-visual-check.mjs
   Requiere: npx playwright install chromium (una vez)
   Salida:   screenshots/prod/*.png
   ═══════════════════════════════════════════════════════════════════════ */

import { chromium } from 'playwright';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

/* Usa el Chromium ya instalado si el headless-shell de la versión exacta
   no está descargado (evita `playwright install` en máquinas lentas). */
function resolveChromiumExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_PATH,
    join(homedir(), 'AppData', 'Local', 'ms-playwright', 'chromium-1228', 'chrome-win64', 'chrome.exe'),
    join(homedir(), 'AppData', 'Local', 'ms-playwright', 'chromium-1217', 'chrome-win64', 'chrome.exe'),
  ].filter(Boolean);
  for (const p of candidates) if (existsSync(p)) return p;
  return undefined;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT = join(ROOT, 'screenshots', 'prod');

const BASE_URL = process.env.PROD_URL || 'https://scaudit.vercel.app';
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

function readEnvLocal() {
  const envPath = join(ROOT, '.env.local');
  if (!existsSync(envPath)) return {};
  const vars = {};
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return vars;
}

/** Busca un portal token válido en la BD (share_tokens/portal_tokens). */
async function findPortalToken() {
  const env = readEnvLocal();
  const dbUrl = env.DATABASE_URL;
  if (!dbUrl) return null;
  try {
    const { Client } = await import('pg');
    // El pooler de Supabase requiere password en texto (no el formato URI
    // con caracteres escapeados) y SSL. No forzamos rejectUnauthorized.
    const u = new URL(dbUrl);
    const client = new Client({
      host: u.hostname,
      port: u.port || 5432,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace('/', ''),
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    // El portal usa /p/[token]; los tokens viven en portal_tokens o share_tokens
    for (const table of ['portal_tokens', 'share_tokens']) {
      try {
        const res = await client.query(
          `SELECT token FROM ${table} ORDER BY created_at DESC LIMIT 1`,
        );
        if (res.rows.length > 0) {
          await client.end();
          return { table, token: res.rows[0].token };
        }
      } catch {
        /* tabla no existe, probar la siguiente */
      }
    }
    await client.end();
  } catch (err) {
    console.warn(`[portal] No se pudo consultar la BD: ${err.message}`);
  }
  return null;
}

async function capturePage(browser, name, path, viewportOptions, { fullPage = false, waitMs = 2500 } = {}) {
  const context = await browser.newContext({ viewport: { width: viewportOptions.width, height: viewportOptions.height }, ...viewportOptions });
  const page = await context.newPage();
  try {
    const url = `${BASE_URL}${path}`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(waitMs);
    const file = join(OUT, `${name}.png`);
    await page.screenshot({ path: file, fullPage });
    const title = await page.title();
    console.log(`✅ ${name}: ${url} → "${title}"`);
    return true;
  } catch (err) {
    console.error(`❌ ${name}: ${err.message.split('\n')[0]}`);
    return false;
  } finally {
    await context.close();
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const executablePath = resolveChromiumExecutable();
  if (executablePath) console.log(` usando Chromium: ${executablePath}`);
  const browser = await chromium.launch(executablePath ? { executablePath } : {});

  console.log(`\n🌐 Capturando ${BASE_URL} → screenshots/prod/\n`);

  // ── Login (desktop + mobile) — valida el rediseño del login ──
  await capturePage(browser, 'login-desktop', '/login', VIEWPORTS.desktop);
  await capturePage(browser, 'login-mobile', '/login', VIEWPORTS.mobile);

  // ── Pricing / Docs públicos — layout responsive ──
  await capturePage(browser, 'pricing-desktop', '/pricing', VIEWPORTS.desktop);
  await capturePage(browser, 'docs-desktop', '/docs', VIEWPORTS.desktop);

  // ── Security audit (público si no requiere sesión; igual capturamos) ──
  await capturePage(browser, 'security-audit-desktop', '/security/audit', VIEWPORTS.desktop);

  // ── Portal cliente (/p/[token]) — el flujo cliente del rediseño (Semana 9) ──
  const portal = await findPortalToken();
  if (portal) {
    console.log(`\n🔑 Portal token encontrado en '${portal.table}' — capturando vista de cliente...`);
    await capturePage(browser, `portal-desktop-${portal.table}`, `/p/${portal.token}`, VIEWPORTS.desktop, { fullPage: true });
    await capturePage(browser, `portal-mobile-${portal.table}`, `/p/${portal.token}`, VIEWPORTS.mobile, { fullPage: true });
  } else {
    console.log('\n⚠️  Sin portal token disponible — la vista /p/[token] se captura sin token para documentar el estado de error:');
    await capturePage(browser, 'portal-sin-token', '/p/token-invalido-de-prueba', VIEWPORTS.desktop);
  }

  // ── Dashboard (requiere sesión; capturamos el redirect a login) ──
  await capturePage(browser, 'dashboard-unauth-redirect', '/', VIEWPORTS.desktop);

  await browser.close();
  console.log(`\n📁 Capturas guardadas en: ${OUT}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
