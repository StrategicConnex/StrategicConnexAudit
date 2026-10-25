import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";

type Credentials = { email: string; password: string };

function readLocalEnv(): Record<string, string> {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return {};

  const entries: Record<string, string> = {};
  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
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
    { name: "disclaimer_accepted", value: "true", domain: "localhost", path: "/" },
  ]);
}

async function login(page: Page, credentials: Credentials): Promise<void> {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  if (new URL(page.url()).pathname !== "/login") return;

  const passwordMode = page.getByRole("button", { name: /Acceso con contrase/i });
  await passwordMode.waitFor({ state: "visible", timeout: 30_000 });
  // Esperar hidratación de React: el click antes de hidratar no abre el modo contraseña.
  await page.waitForTimeout(500);
  await passwordMode.click();

  await page.locator("#login-email").waitFor({ state: "visible", timeout: 15_000 });
  await page.locator("#login-email").fill(credentials.email);
  await page.locator('input[type="password"]').waitFor({ state: "visible", timeout: 15_000 });
  await page.locator('input[type="password"]').fill(credentials.password);
  await page.locator('form button[type="submit"]').last().click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

async function expectNoCriticalA11yViolations(page: Page, route: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  const critical = results.violations.filter((violation) => violation.impact === "critical");
  const summary = critical
    .map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length} nodos)`)
    .join("\n");

  expect(critical, `Violaciones axe críticas en ${route}:\n${summary}`).toHaveLength(0);
}

test.describe("A11y · gate axe-core (Task 0.8 + A6)", () => {
  test("/login no tiene violaciones axe críticas", async ({ page, context }) => {
    await acceptDisclaimer(context);
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.locator("#login-email").waitFor({ state: "visible" });

    await expectNoCriticalA11yViolations(page, "/login");
  });

  test("/ no tiene violaciones axe críticas", async ({ page, context }) => {
    const credentials = getCredentials();
    test.skip(!credentials, "Faltan TEST_AUTH_EMAIL/TEST_AUTH_PASSWORD para rutas autenticadas");

    await acceptDisclaimer(context);
    await login(page, credentials!);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    await page.waitForTimeout(1_500);

    await expectNoCriticalA11yViolations(page, "/");
  });

  test("/intelligence no tiene violaciones axe críticas", async ({ page, context }) => {
    const credentials = getCredentials();
    test.skip(!credentials, "Faltan TEST_AUTH_EMAIL/TEST_AUTH_PASSWORD para rutas autenticadas");

    await acceptDisclaimer(context);
    await login(page, credentials!);
    await page.goto("/intelligence", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    await page.waitForTimeout(1_500);

    await expectNoCriticalA11yViolations(page, "/intelligence");
  });
});
