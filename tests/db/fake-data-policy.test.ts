import { describe, it, expect } from "vitest";
import {
  PATTERNS,
  KEEP,
  DEMO_PROJECT_PATTERNS,
  PLACEHOLDER_PROJECT_NAMES,
  PURGE_TABLES,
  PURGE_EXPECTED,
  PROJECT_SCOPED_TABLES,
  PROJECT_SCOPED_CASCADE_TABLES,
  PURGE_EXPECTED_PROJECT_SCOPED,
} from "../../scripts/lib/fake-data-patterns.mjs";

/**
 * Regresión de la política de datos falsos (auditor + purga comparten este
 * módulo). No toca la BD: reproduce el predicado de los scripts
 * (`strpos(lower(col), fragmento) > 0`) sobre fixtures REALES del 2026-10-12.
 *
 * El caso que justifica la suite es el de P0.5: una regla de subcadena habría
 * borrado al admin real y sus proyectos. Aquí queda clavado para siempre.
 */

/** Igual que `selectMatches`: coincidencia por subcadena, sin distinguir caso. */
const matchesAny = (patterns: string[], text: string) =>
  patterns.some((f) => text.toLowerCase().includes(f.toLowerCase()));

const allFragments = PATTERNS.flatMap((p) => p.find as string[]);
const deleteFragments = PATTERNS.filter((p) => p.kind === "DELETE").flatMap(
  (p) => p.find as string[]
);

describe("política de datos falsos — PATTERNS", () => {
  it("marca como DELETE las identidades sintéticas conocidas", () => {
    expect(matchesAny(deleteFragments, "dev@localhost.dev")).toBe(true);
    expect(matchesAny(deleteFragments, "e2e.rls.1789926221820@gmail.com")).toBe(true);
  });

  it("NO marca la credencial del smoke (vive en KEEP)", () => {
    const smoke = "smoke-test@strategicconnex.test";
    expect(matchesAny(deleteFragments, smoke)).toBe(false);
    expect(KEEP.some((k: string) => smoke.toLowerCase().includes(k.toLowerCase()))).toBe(true);
  });

  it("NO marca al admin real ni su email (evita el CASCADE sobre sus proyectos)", () => {
    // `projects.owner_id` es ON DELETE CASCADE: marcar esta fila borraría sus
    // proyectos. Es la trampa que P0.5 esquivó al no usar subcadenas de dominio.
    expect(matchesAny(allFragments, "adminsc@strategicconnex.com.ar")).toBe(false);
    expect(matchesAny(allFragments, "barbaritacherem@gmail.com")).toBe(false);
  });

  it("NO marca un proyecto real (`ops` / opssrl.com.ar)", () => {
    expect(matchesAny(allFragments, "ops")).toBe(false);
    expect(matchesAny(allFragments, "https://opssrl.com.ar/")).toBe(false);
  });

  it("mantiene los patrones históricos de la Fase 1", () => {
    expect(matchesAny(deleteFragments, "https://example.com")).toBe(true);
    expect(matchesAny(deleteFragments, "Pipeline Test - strategicconnex.com.ar")).toBe(true);
  });
});

describe("política de datos falsos — proyectos placeholder (P0.5)", () => {
  /** Igual que el SQL del auditor/purga: `lower(name) = ANY($1)`. */
  const byName = (name: string) =>
    PLACEHOLDER_PROJECT_NAMES.some((n: string) => n.toLowerCase() === name.toLowerCase());

  it("selecciona EXACTAMENTE los 3 proyectos decididos por el operador", () => {
    expect(byName("runrun")).toBe(true);
    expect(byName("strategic connex")).toBe(true);
    expect(byName("Strategic Connex COM AR")).toBe(true);
  });

  it("no arrastra proyectos parecidos ni orgs con el mismo dominio", () => {
    expect(byName("ops")).toBe(false);
    expect(byName("strategic connex plus")).toBe(false);
    expect(byName("StrategicConnex's Org")).toBe(false);
    expect(byName("Consultora BPOMA")).toBe(false);
  });

  it("documenta por qué NO se usa subcadena de dominio: el email del admin la contiene", () => {
    // Si `strategicconnex.com.ar` estuviera en PATTERNS, esto sería `true` y el
    // admin real entraría en la purga. La igualdad exacta por nombre lo impide.
    expect(matchesAny(allFragments, "adminsc@strategicconnex.com.ar")).toBe(false);
    expect(
      matchesAny(PLACEHOLDER_PROJECT_NAMES as string[], "https://strategicconnex.com.ar")
    ).toBe(false); // la lista se compara por `name`, no por `domain`
  });

  it("los patrones históricos de proyecto demo siguen presentes", () => {
    expect((DEMO_PROJECT_PATTERNS as string[]).includes("example.com")).toBe(true);
  });
});

describe("política de datos falsos — coherencia con los gates de la purga", () => {
  it("todo recuento declarado por patrón corresponde a una tabla del allowlist", () => {
    for (const table of Object.keys(PURGE_EXPECTED)) {
      expect(PURGE_TABLES.has(table)).toBe(true);
    }
  });

  it("todo recuento project-scoped corresponde a una tabla declarada", () => {
    for (const table of Object.keys(PURGE_EXPECTED_PROJECT_SCOPED)) {
      expect(PROJECT_SCOPED_TABLES.has(table) || PROJECT_SCOPED_CASCADE_TABLES.has(table)).toBe(
        true
      );
    }
  });

  it("intelligence_run_events está declarada en el cierre por CASCADE (drizzle/0043)", () => {
    expect(PROJECT_SCOPED_CASCADE_TABLES.has("intelligence_run_events")).toBe(true);
  });
});
