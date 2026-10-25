import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Gate de CSP en producción.
 *
 * Reproduce el fallo real: Next emitía un `<script src>` del loading boundary
 * sin `nonce`, por lo que `strict-dynamic` lo bloqueaba. El test escucha
 * `securitypolicyviolation`, revisa el HTML inicial y compara el nonce del
 * header con el del meta tag en cada carga.
 */

const LOADS_PER_ROUTE = 10;
const ROUTES_WITH_SESSION = ["/", "/dashboard", "/intelligence"] as const;
const PUBLIC_ROUTE = "/login";

type CspViolation = {
  blockedURI: string;
  violatedDirective: string;
  effectiveDirective: string;
  sourceFile: string;
  lineNumber: number;
};

type Credentials = { email: string; password: string };

function readLocalEnv(): Record<string, string> {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return {};

  const entries: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    entries[key] = value;
  }
  return entries;
}

function getCredentials(): Credentials | null {
  const local = readLocalEnv();
  const email = process.env.TEST_AUTH_EMAIL ?? local.TEST_AUTH_EMAIL;
  const password = process.env.TEST_AUTH_PASSWORD ?? local.TEST_AUTH_PASSWORD;
  return email && password ? { email, password } : null;
}

async function acceptDisclaimer(context: BrowserContext): Promise<void> {
  await context.addCookies([
    {
      name: "disclaimer_accepted",
      value: "true",
      domain: "localhost",
      path: "/",
    },
  ]);
}

async function installViolationCollector(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type Violation = {
      blockedURI: string;
      violatedDirective: string;
      effectiveDirective: string;
      sourceFile: string;
      lineNumber: number;
    };
    const target = window as unknown as { __cspViolations: Violation[] };
    target.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      target.__cspViolations.push({
        blockedURI: event.blockedURI,
        violatedDirective: event.violatedDirective,
        effectiveDirective: event.effectiveDirective,
        sourceFile: event.sourceFile,
        lineNumber: event.lineNumber,
      });
    });
  });
}

async function login(page: Page, credentials: Credentials): Promise<void> {
  await page.goto("/login", { waitUntil: "networkidle" });
  if (new URL(page.url()).pathname !== "/login") return;

  await page.getByRole("button", { name: /Acceso con contrase/i }).click();
  await page.locator("#login-email").fill(credentials.email);
  await page.locator('input[type="password"]').fill(credentials.password);
  await page.locator('form button[type="submit"]').last().click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

function nonceFromPolicy(policy: string): string | null {
  return /nonce-([^']+)/.exec(policy)?.[1] ?? null;
}

function bareScriptSources(html: string): string[] {
  const sources: string[] = [];
  for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
    const attrs = match[1] ?? "";
    if (!/\bsrc=/i.test(attrs) || /\bnonce=/i.test(attrs)) continue;
    const src = /\bsrc=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
    sources.push(src?.[1] ?? src?.[2] ?? src?.[3] ?? "(sin src)");
  }
  return sources;
}

async function assertRouteIsCspClean(page: Page, route: string): Promise<void> {
  const violations: CspViolation[] = [];
  const consoleErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  for (let load = 1; load <= LOADS_PER_ROUTE; load++) {
    consoleErrors.length = 0;
    const response = await page.goto(route, { waitUntil: "networkidle" });
    await page.waitForTimeout(750);

    const snapshot = await page.evaluate(() => {
      const target = window as unknown as { __cspViolations?: CspViolation[] };
      const meta = document
        .querySelector('meta[http-equiv="Content-Security-Policy"]')
        ?.getAttribute("content");
      return { violations: target.__cspViolations ?? [], meta: meta ?? "" };
    });

    const headerPolicy = response?.headers()["content-security-policy"] ?? "";
    const headerNonce = nonceFromPolicy(headerPolicy);
    const metaNonce = nonceFromPolicy(snapshot.meta);
    const html = response ? await response.text() : "";
    const bareScripts = bareScriptSources(html);
    const cspConsoleErrors = consoleErrors.filter((text) =>
      /Content Security Policy|Refused to (load|execute)|violates the following/i.test(text),
    );

    const context = `${route} (carga ${load}/${LOADS_PER_ROUTE})`;
    expect(headerNonce, `header CSP sin nonce en ${context}`).toBeTruthy();
    expect(metaNonce, `meta CSP sin nonce en ${context}`).toBe(headerNonce);
    expect(bareScripts, `scripts sin nonce en el HTML inicial de ${context}`).toEqual([]);
    expect(cspConsoleErrors, `errores CSP en consola de ${context}`).toEqual([]);
    expect(snapshot.violations, `violaciones CSP en ${context}`).toEqual([]);
    violations.push(...snapshot.violations);
  }

  expect(violations, `violaciones acumuladas en ${route}`).toEqual([]);
}

test.describe("CSP con nonce — ruta pública", () => {
  test(`${PUBLIC_ROUTE} no emite violaciones CSP`, async ({ context, page }) => {
    await acceptDisclaimer(context);
    await installViolationCollector(page);
    await assertRouteIsCspClean(page, PUBLIC_ROUTE);
  });
});

test.describe("CSP con nonce — rutas autenticadas", () => {
  const credentials = getCredentials();
  test.skip(
    !credentials,
    "TEST_AUTH_EMAIL/TEST_AUTH_PASSWORD no están definidos (process.env o .env.local)",
  );

  test.beforeEach(async ({ context, page }) => {
    await acceptDisclaimer(context);
    await installViolationCollector(page);
    await login(page, credentials!);
  });

  for (const route of ROUTES_WITH_SESSION) {
    test(`${route} no emite violaciones CSP`, async ({ page }) => {
      await assertRouteIsCspClean(page, route);
    });
  }
});
