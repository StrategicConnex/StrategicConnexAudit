import { chromium, Browser, Page } from "playwright";
import * as fs from "fs";
import * as path from "path";

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const SCREENSHOTS_DIR = process.env.SCREENSHOTS_DIR || "C:\\Users\\Juan\\AppData\\Local\\Temp\\opencode";
const BROWSER_URL = process.env.PLAYWRIGHT_BROWSER_URL || "http://localhost:3000";

const PROJECT_REF = process.env.PROJECT_REF || "scaudit";
const cookieName = `sb-${PROJECT_REF}-auth-token`;

interface Finding {
  id: string;
  severity: "B0" | "B1" | "B2" | "B3";
  evidence: string;
  proposal: string;
  effort: "S" | "M" | "L";
  journey: string;
}

const findings: Finding[] = [];

function log(msg: string) {
  console.log(msg);
}

function screenshot(page: Page, journey: string, step: string) {
  const safe = step.replace(/[^a-zA-Z0-9_-]/g, "-");
  const file = path.join(SCREENSHOTS_DIR, `ux-${journey}-${safe}.png`);
  page.screenshot({ path: file, fullPage: true }).catch(() => {});
  log(`📸 ${file}`);
  return file;
}

async function waitForDevServer(): Promise<void> {
  const maxWait = 30_000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const r = await fetch(BROWSER_URL + "/", { signal: AbortSignal.timeout(3000) });
      if (r.status < 500) return;
    } catch { /* still waiting */ }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error(`Dev server not reachable at ${BROWSER_URL} after ${maxWait}ms`);
}

async function launchBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true });
}

export async function runJ1(): Promise<Finding[]> {
  const b = await launchBrowser();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  const page = await ctx.newPage();
  try {
    await page.goto(BROWSER_URL + "/", { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(2000);
    screenshot(page, "j1", "00-landing");

    // Check: can user understand what the product does from the landing?
    const heroText = await page.locator("text=/¿Qué hace/").count();
    if (heroText === 0) {
      findings.push({ id: `B-${findings.filter(f => f.journey === "J1").length + 100}`, severity: "B1", evidence: "landing hero text", proposal: "Agregar headline en español que explique qué hace el producto en una frase.", journey: "J1", effort: "S" });
    }

    // Check: is there a login button?
    const loginBtn = page.getByRole("button", { name: /login|entrar|sign in/i });
    if (await loginBtn.count() === 0) {
      findings.push({ id: `B-${findings.length + 100}`, severity: "B0", evidence: "no login CTA", proposal: "Agregar botón de login visible.", journey: "J1", effort: "S" });
    }

    // Try to navigate to dashboard without login
    const dashLink = page.getByRole("link", { name: /dashboard/i });
    if (await dashLink.count() > 0) {
      await dashLink.click();
      await page.waitForTimeout(1500);
      screenshot(page, "j1", "01-dashboard-no-login");
      const url = page.url();
      if (url.includes("/login") || url.includes("/auth")) {
        findings.push({ id: `B-${findings.length + 100}`, severity: "B0", evidence: `dashboard requires auth (got ${url})`, proposal: "Proporcionar usuario de prueba o bypass documentado.", journey: "J1", effort: "M" });
      }
    }

    // Attempt to create project with INVALID data (the validation test)
    // Try to add a domain with invalid URL
    const addBtn = page.getByRole("button", { name: /nuevo proyecto|agregar/i });
    if (await addBtn.count() > 0) {
      await addBtn.click();
      await page.waitForTimeout(1000);
      screenshot(page, "j1", "02-modal-open");

      // Check modal has proper dialog role
      const dialog = page.getByRole("dialog");
      if (await dialog.count() === 0) {
        findings.push({ id: `B-${findings.length + 100}`, severity: "B1", evidence: "modal sin role=dialog", proposal: "Agregar role='dialog' y aria-modal='true' al modal.", journey: "J1", effort: "S" });
      }

      // Look for URL input and try invalid URL
      const urlInput = page.getByLabel(/url|dominio|base/i);
      if (await urlInput.count() > 0) {
        await urlInput.fill("invalid-url-no-protocol");
        await page.waitForTimeout(500);
        // Check if validation error is understandable
        const errorMsg = page.locator("text=/ingresa|introduce|escribe/i");
        if (await errorMsg.count() === 0) {
          findings.push({ id: `B-${findings.length + 100}`, severity: "B1", evidence: "sin mensaje de validación claro para URL inválida", proposal: "Agregar mensaje de validación en español: 'Ingresa una URL válida (ej: https://...)'", journey: "J1", effort: "S" });
        }
        screenshot(page, "j1", "03-invalid-url");
      }
    }

    // Dashboard empty state: does user know what to do?
    await page.goto(BROWSER_URL + "/dashboard");
    await page.waitForTimeout(1500);
    screenshot(page, "j1", "04-dashboard-empty");

    // Check: is there a clear CTA to create something?
    const cta = page.getByRole("button", { name: /nuevo|crear|agregar|add/i });
    if (await cta.count() === 0) {
      findings.push({ id: `B-${findings.length + 100}`, severity: "B1", evidence: "dashboard vacío sin CTA claro", proposal: "Cuando el dashboard está vacío, mostrar un CTA prominente: '¿Qué quieres monitorear?'", journey: "J1", effort: "M" });
    }

    // Check: after creating, does user find the project?
    // Verify no stale test data
    const projectCards = page.locator("[data-testid='project-card'], article, .project-card");
    // If there are demo projects with .example.com domains without badge
    const demoCards = page.locator("text=Demo");
    if (await projectCards.count() > 0 && await demoCards.count() === 0) {
      // Check for .example.com domains without DEMO badge
      const exampleDomains = page.locator("text=/\\.example\\.com/");
      if (await exampleDomains.count() > 0) {
        findings.push({ id: `B-${findings.length + 100}`, severity: "B2", evidence: "dominio .example.com sin badge Demo", proposal: "Agregar badge 'Demo' a proyectos con dominios de ejemplo (RFC 2606).", journey: "J1", effort: "S" });
      }
    }
  } finally {
    await ctx.close();
    await b.close();
  }
  return findings.filter(f => f.journey === "J1");
}

export async function runJ2(): Promise<Finding[]> {
  const b = await launchBrowser();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", isMobile: true });
  const page = await ctx.newPage();
  try {
    await page.goto(BROWSER_URL + "/", { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(2000);
    screenshot(page, "j2", "00-landing-mobile");

    // Check: drawer/navigation accessible on mobile?
    const menuBtn = page.getByRole("button", { name: /menu|navigation|drawer/i });
    if (await menuBtn.count() > 0) {
      await menuBtn.click();
      await page.waitForTimeout(1000);
      screenshot(page, "j2", "01-drawer-open");

      // Can user reach all main sections?
      const sections = page.locator("text=/dashboard|proyectos|informes|configuración/i");
      const sectionCount = await sections.count();
      if (sectionCount < 3) {
        findings.push({ id: `B-${findings.length + 100}`, severity: "B1", evidence: `drawer muestra ${sectionCount} secciones (se esperan ≥3)`, proposal: "Verificar que el drawer/menu tenga todas las secciones principales accesibles en móvil.", journey: "J2", effort: "S" });
      }
    }

    // Check: hero section on mobile?
    await page.goto(BROWSER_URL + "/dashboard");
    await page.waitForTimeout(1500);
    screenshot(page, "j2", "02-dashboard-mobile");

    // Check: any content hidden behind FAB or hamburger?
    const fab = page.locator("[class*='fab'], [class*='floating'], button[aria-label='menu']");
    if (await fab.count() > 0) {
      findings.push({ id: `B-${findings.length + 100}`, severity: "B2", evidence: "FAB puede bloquear contenido en móvil", proposal: "Posicionar FAB fuera del área de contenido principal o usar bottom sheet.", journey: "J2", effort: "S" });
    }

    // Check: is there content visible on empty dashboard?
    const emptyState = page.getByRole("status", { name: /sin datos|vacío|no hay/i });
    if (await emptyState.count() === 0) {
      const bodyText = await page.locator("body").textContent();
      if (bodyText && bodyText.trim().length < 200) {
        findings.push({ id: `B-${findings.length + 100}`, severity: "B1", evidence: "dashboard móvil parece vacío sin mensaje de bienvenida", proposal: "Mostrar mensaje: '¡Bienvenido! Aquí empezarás a monitorear tus sitios.'", journey: "J2", effort: "S" });
      }
    }
  } finally {
    await ctx.close();
    await b.close();
  }
  return findings.filter(f => f.journey === "J2");
}

export async function runJ3(): Promise<Finding[]> {
  const b = await launchBrowser();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  const page = await ctx.newPage();
  try {
    // Test 3a: bad route
    await page.goto(BROWSER_URL + "/projects/nonexistent-route-404-test", { waitUntil: "networkidle", timeout: 15_000 });
    await page.waitForTimeout(1000);
    screenshot(page, "j3", "01-bad-route");

    const bodyText = await page.locator("body").textContent();
    if (bodyText && !bodyText.includes("404") && !bodyText.includes("no encontrado") && !bodyText.includes("no existe")) {
      findings.push({ id: `B-${findings.length + 100}`, severity: "B1", evidence: "ruta inexistente sin mensaje claro", proposal: "Mostrar 'Esta página no existe' con enlace a '/projects' en español.", journey: "J3", effort: "S" });
    }
    // Check: does 404 have a CTA?
    const cta404 = page.getByRole("link", { name: /proyectos|volver|inicio/i });
    if (await cta404.count() === 0) {
      findings.push({ id: `B-${findings.length + 100}`, severity: "B1", evidence: "404 sin CTA/siguiente paso", proposal: "Agregar botón 'Volver a proyectos' en la página 404.", journey: "J3", effort: "S" });
    }

    // Test 3b: empty form submission
    await page.goto(BROWSER_URL + "/");
    await page.waitForTimeout(1000);
    const addBtn = page.getByRole("button", { name: /nuevo proyecto|agregar/i });
    if (await addBtn.count() > 0) {
      await addBtn.click();
      await page.waitForTimeout(800);
      // Try submitting empty form
      const submitBtn = page.getByRole("button", { name: /crear|submit|guardar/i });
      if (await submitBtn.count() > 0) {
        await submitBtn.click();
        await page.waitForTimeout(1000);
        screenshot(page, "j3", "02-empty-form");

        // Check validation messages are understandable
        const errorMsg = await page.locator("text=/campo|requerido|completa|completar/i").count();
        if (errorMsg === 0) {
          findings.push({ id: `B-${findings.length + 100}`, severity: "B1", evidence: "formulario vacío sin mensaje de validación comprensible", proposal: "Mostrar: 'Este campo es obligatorio' junto a cada input vacío.", journey: "J3", effort: "S" });
        }
      }
    }

    // Test 3c: no session (access protected route)
    const ctx2 = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark", storageState: undefined });
    const page2 = await ctx2.newPage();
    try {
      await page2.goto(BROWSER_URL + "/dashboard", { waitUntil: "networkidle", timeout: 15_000 });
      await page2.waitForTimeout(1500);
      screenshot(page2, "j3", "03-no-session");

      const url = page2.url();
      if (!url.includes("/login") && !url.includes("/auth")) {
        findings.push({ id: `B-${findings.length + 100}`, severity: "B0", evidence: "ruta protegida accesible sin sesión", proposal: "Asegurar redirección a login cuando no hay sesión activa.", journey: "J3", effort: "M" });
      }
    } finally {
      await ctx2.close();
    }
  } finally {
    await ctx.close();
    await b.close();
  }
  return findings.filter(f => f.journey === "J3");
}

export async function runJ4(): Promise<Finding[]> {
  const b = await launchBrowser();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  const page = await ctx.newPage();
  try {
    await page.goto(BROWSER_URL + "/", { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(2000);

    // Navigate to reports area
    const reportsTab = page.getByRole("tab", { name: /informe|report|análisis/i });
    if (await reportsTab.count() > 0) {
      await reportsTab.click();
      await page.waitForTimeout(1500);
      screenshot(page, "j4", "01-reports-tab");

      // Check: can user generate/understand the main deliverable?
      const generateBtn = page.getByRole("button", { name: /generar|crear|descargar|exportar/i });
      if (await generateBtn.count() > 0) {
        await generateBtn.click();
        await page.waitForTimeout(2000);
        screenshot(page, "j4", "02-generate-report");

        // Check: report content has jargon without explanation?
        const bodyText = await page.locator("body").textContent();
        const jargonTerms = ["LCP", "GSC", "MITRE", "SIEM", "RUM", "SERP", "Core Web Vitals", "SEO", "TTFB"];
        for (const term of jargonTerms) {
          if (bodyText && bodyText.includes(term)) {
            // Check if there's a tooltip/explanation nearby
            const tooltip = page.getByRole("button", { name: new RegExp(term, "i") });
            if (await tooltip.count() === 0) {
              findings.push({ id: `B-${findings.length + 100}`, severity: "B1", evidence: `Término "${term}" sin explicación en el informe`, proposal: `Agregar tooltip o subtítulo explicativo para "${term}" en el informe.`, journey: "J4", effort: "S" });
            }
          }
        }
      }
    } else {
      findings.push({ id: `B-${findings.length + 100}`, severity: "B1", evidence: "sin pestaña de informes visible", proposal: "Asegurar que la sección de informes/reportes esté accesible desde el dashboard.", journey: "J4", effort: "M" });
    }

    // Check: KPI numbers have verdict (is this good or bad?)
    const kpiElements = page.locator("[class*='kpi'], [class*='metric'], [class*='score'], [class*='health']");
    const kpiCount = await kpiElements.count();
    if (kpiCount > 0) {
      findings.push({ id: `B-${findings.length + 100}`, severity: "B1", evidence: `${kpiCount} KPIs sin veredicto (¿bueno o malo?)`, proposal: "Agregar semáforo (🟢🟡🔴) o texto explicativo junto a cada número: '99.9% = excelente'.", journey: "J4", effort: "M" });
    }
  } finally {
    await ctx.close();
    await b.close();
  }
  return findings.filter(f => f.journey === "J4");
}

// ─── CLI entry points ──────────────────────────────────────────

const command = process.argv[2];

async function main() {
  await waitForDevServer();
  log(`🚀 Dev server reachable at ${BROWSER_URL}`);

  const allFindings: Finding[] = [];

  switch (command) {
    case "j1": {
      const f = await runJ1();
      allFindings.push(...f);
      log(`\n📋 J1 encontró ${f.length} hallazgos`);
      break;
    }
    case "j2": {
      const f = await runJ2();
      allFindings.push(...f);
      log(`\n📋 J2 encontró ${f.length} hallazgos`);
      break;
    }
    case "j3": {
      const f = await runJ3();
      allFindings.push(...f);
      log(`\n📋 J3 encontró ${f.length} hallazgos`);
      break;
    }
    case "j4": {
      const f = await runJ4();
      allFindings.push(...f);
      log(`\n📋 J4 encontró ${f.length} hallazgos`);
      break;
    }
    case "all":
    default: {
      for (const j of ["j1", "j2", "j3", "j4"]) {
        const runner = j === "j1" ? runJ1 : j === "j2" ? runJ2 : j === "j3" ? runJ3 : runJ4;
        const f = await runner();
        allFindings.push(...f);
        log(`\n📋 ${j.toUpperCase()} encontró ${f.length} hallazgos`);
      }
      break;
    }
  }

  // Save findings
  const outPath = path.join(SCREENSHOTS_DIR, "ux-findings.json");
  fs.writeFileSync(outPath, JSON.stringify(allFindings, null, 2));
  log(`\n💾 Hallazgos guardados en ${outPath}`);
  log(`Total: ${allFindings.length} hallazgos`);

  // Print summary
  const bySeverity = new Map<string, number>();
  for (const f of allFindings) {
    bySeverity.set(f.severity, (bySeverity.get(f.severity) || 0) + 1);
  }
  bySeverity.forEach((count, sev) => {
    log(`  ${sev}: ${count}`);
  });

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
