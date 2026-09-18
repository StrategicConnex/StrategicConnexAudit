import { test, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const SCREENSHOTS_DIR = "C:\\Users\\Juan\\AppData\\Local\\Temp\\opencode";
const BASE_URL = "http://localhost:3000";

interface UxFinding {
  id: string;
  severity: string;
  evidence: string;
  proposal: string;
  effort: string;
  index: number;
}

test.describe("End-User Simulation (super-skill)", () => {
  const findings: Record<string, UxFinding[]> = { J1: [], J2: [], J3: [], J4: [] };

  test.beforeAll(async () => {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  });

  test.afterAll(() => {
    const outPath = path.join(SCREENSHOTS_DIR, "ux-findings.json");
    fs.writeFileSync(outPath, JSON.stringify(
      Object.entries(findings).flatMap(([j, f]) => f.map((fi) => ({ ...fi, journey: j }))),
      null, 2
    ));
    console.log(`\n📋 Total findings: ${Object.values(findings).flat().length}`);
  });

  function screenshot(page: Page, journey: string, step: string) {
    const safe = step.replace(/[^a-zA-Z0-9_-]/g, "-");
    const file = path.join(SCREENSHOTS_DIR, `ux-${journey}-${safe}.png`);
    page.screenshot({ path: file, fullPage: true }).catch(() => {});
  }

  function finding(sev: string, ev: string, prop: string, effort: string, idx: number): UxFinding {
    return { id: `B-${100 + idx}`, severity: sev, evidence: ev, proposal: prop, effort, index: idx };
  }

  // ─── J1: Primer uso ────────────────────────────────────
  test("J1 Primer uso — creación de proyecto y validación", async ({ page }) => {
    const f: UxFinding[] = [];
    await page.goto(BASE_URL + "/", { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(2000);
    screenshot(page, "j1", "00-landing");

    // ¿Entiende qué hace el producto?
    const bodyText = await page.locator("body").textContent();
    if (!bodyText?.includes("monitoreo") && !bodyText?.includes("SEO")) {
      f.push(finding("B1", "landing hero text sin explicación clara", "Agregar headline en español que explique qué hace el producto.", "S", f.length));
    }

    // ¿Tiene botón de login/entrada?
    const loginBtn = page.getByRole("button", { name: /login|entrar/i });
    if (await loginBtn.count() === 0) {
      f.push(finding("B0", "sin CTA de login visible", "Agregar botón de login visible.", "S", f.length));
    }

    // Dashboard vacío: ¿qué hacer?
    await page.getByRole("link", { name: /dashboard/i }).count();
    await page.waitForTimeout(1000);
    screenshot(page, "j1", "02-dashboard-empty");

    // ¿Hay CTA para crear algo?
    const cta = page.getByRole("button", { name: /nuevo|crear|agregar/i });
    if (await cta.count() === 0) {
      f.push(finding("B1", "dashboard vacío sin CTA claro", "Cuando el dashboard está vacío, mostrar CTA: '¿Qué quieres monitorear?'", "M", f.length));
    }

    // Crear proyecto con URL inválida
    const addBtn = page.getByRole("button", { name: /nuevo proyecto|agregar/i });
    if (await addBtn.count() > 0) {
      await addBtn.click();
      await page.waitForTimeout(1000);
      screenshot(page, "j1", "03-modal-open");

      // ¿Modal con role dialog?
      const dialog = page.getByRole("dialog");
      if (await dialog.count() === 0) {
        f.push(finding("B1", "modal sin role='dialog'", "Agregar role='dialog' aria-modal='true' al modal.", "S", f.length));
      }

      // Probar URL inválida
      const urlInput = page.getByLabel("URL Base (Dominio)");
      if (await urlInput.count() > 0) {
        await urlInput.fill("invalid-url");
        await page.waitForTimeout(500);
        const errorMsg = page.locator("text=/ingresa|introduce|escribe/i");
        if (await errorMsg.count() === 0) {
          f.push(finding("B1", "sin mensaje de validación comprensible", "Mostrar: 'Ingresa una URL válida (ej: https://...)'", "S", f.length));
        }
        screenshot(page, "j1", "04-invalid-url");
      }
    }

    findings.J1 = f;
  });

  // ─── J2: Móvil 390px ───────────────────────────────────
  test("J2 Móvil 390px — navegación y contenido", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, colorScheme: "dark" });
    const page = await ctx.newPage();
    const f: UxFinding[] = [];
    try {
      await page.goto(BASE_URL + "/", { waitUntil: "networkidle", timeout: 30_000 });
      await page.waitForTimeout(2000);
      screenshot(page, "j2", "00-landing-mobile");

      // ¿Drawer accesible?
      const menuBtn = page.getByRole("button", { name: /menu|navigation|drawer/i });
      if (await menuBtn.count() > 0) {
        await menuBtn.click();
        await page.waitForTimeout(1000);
        screenshot(page, "j2", "01-drawer-open");

        const sections = page.locator("text=/dashboard|proyectos|informes|configuración/i");
        if (await sections.count() < 3) {
          f.push(finding("B1", `drawer muestra ${await sections.count()} secciones`, "Verificar que el drawer tenga todas las secciones principales.", "S", f.length));
        }
      }

      // ¿Hero visible en móvil?
      await page.goto(BASE_URL + "/dashboard");
      await page.waitForTimeout(1500);
      screenshot(page, "j2", "02-dashboard-mobile");

      // ¿FAB bloquea contenido?
      const fab = page.locator("[class*='fab'], [class*='floating']");
      if (await fab.count() > 0) {
        f.push(finding("B2", "FAB puede bloquear contenido en móvil", "Posicionar FAB fuera del área de contenido principal.", "S", f.length));
      }
    } finally {
      await ctx.close();
    }
    findings.J2 = f;
  });

  // ─── J3: Recuperación ──────────────────────────────────
  test("J3 Recuperación — errores y mensajes", async ({ page }) => {
    const f: UxFinding[] = [];

    // Ruta inexistente
    await page.goto(BASE_URL + "/projects/nonexistent-route-404-test", { waitUntil: "networkidle", timeout: 15_000 });
    await page.waitForTimeout(1000);
    screenshot(page, "j3", "01-bad-route");

    const bodyText = await page.locator("body").textContent();
    if (bodyText && !bodyText.includes("404") && !bodyText.includes("no encontrado")) {
      f.push(finding("B1", "ruta inexistente sin mensaje claro", "Mostrar 'Esta página no existe' con enlace a '/projects' en español.", "S", f.length));
    }
    const cta404 = page.getByRole("link", { name: /proyectos|volver|inicio/i });
    if (await cta404.count() === 0) {
      f.push(finding("B1", "404 sin CTA/siguiente paso", "Agregar botón 'Volver a proyectos' en la página 404.", "S", f.length));
    }

    // Formulario vacío
    await page.goto(BASE_URL + "/");
    await page.waitForTimeout(1000);
    const addBtn = page.getByRole("button", { name: /nuevo proyecto|agregar/i });
    if (await addBtn.count() > 0) {
      await addBtn.click();
      await page.waitForTimeout(800);
      const submitBtn = page.getByRole("button", { name: /crear|submit|guardar/i });
      if (await submitBtn.count() > 0) {
        await submitBtn.click();
        await page.waitForTimeout(1000);
        screenshot(page, "j3", "02-empty-form");

        const errorMsg = await page.locator("text=/campo|requerido|completa/i").count();
        if (errorMsg === 0) {
          f.push(finding("B1", "formulario vacío sin mensaje de validación comprensible", "Mostrar: 'Este campo es obligatorio' junto a cada input vacío.", "S", f.length));
        }
      }
    }

    // Sin sesión
    const ctx2 = await page.context().browser()!.newContext({ storageState: undefined, viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
    const page2 = await ctx2.newPage();
    try {
      await page2.goto(BASE_URL + "/dashboard", { waitUntil: "networkidle", timeout: 15_000 });
      await page2.waitForTimeout(1500);
      screenshot(page2, "j3", "03-no-session");
      const url = page2.url();
      if (!url.includes("/login") && !url.includes("/auth")) {
        f.push(finding("B0", "ruta protegida accesible sin sesión", "Asegurar redirección a login cuando no hay sesión activa.", "M", f.length));
      }
    } finally {
      await ctx2.close();
    }
    findings.J3 = f;
  });

  // ─── J4: Informe ───────────────────────────────────────
  test("J4 Informe — generación y comprensión", async ({ page }) => {
    const f: UxFinding[] = [];
    await page.goto(BASE_URL + "/", { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(2000);

    const reportsTab = page.getByRole("tab", { name: /informe|report|análisis/i });
    if (await reportsTab.count() > 0) {
      await reportsTab.click();
      await page.waitForTimeout(1500);
      screenshot(page, "j4", "01-reports-tab");

      const generateBtn = page.getByRole("button", { name: /generar|crear|descargar|exportar/i });
      if (await generateBtn.count() > 0) {
        await generateBtn.click();
        await page.waitForTimeout(2000);
        screenshot(page, "j4", "02-generate-report");

        const bodyText = await page.locator("body").textContent();
        const jargonTerms = ["LCP", "GSC", "MITRE", "SIEM", "RUM", "SERP", "Core Web Vitals", "SEO", "TTFB"];
        for (const term of jargonTerms) {
          if (bodyText && bodyText.includes(term)) {
            const tooltip = page.getByRole("button", { name: new RegExp(term, "i") });
            if (await tooltip.count() === 0) {
              f.push(finding("B1", `Término "${term}" sin explicación en el informe`, `Agregar tooltip o subtítulo explicativo para "${term}".`, "S", f.length));
            }
          }
        }
      }
    } else {
      f.push(finding("B1", "sin pestaña de informes visible", "Asegurar que la sección de informes esté accesible desde el dashboard.", "M", f.length));
    }

    // KPIs sin veredicto
    const kpiElements = page.locator("[class*='kpi'], [class*='metric'], [class*='score'], [class*='health']");
    const kpiCount = await kpiElements.count();
    if (kpiCount > 0) {
      f.push(finding("B1", `${kpiCount} KPIs sin veredicto (¿bueno o malo?)`, "Agregar semáforo o texto explicativo junto a cada número.", "M", f.length));
    }
    findings.J4 = f;
  });
});
