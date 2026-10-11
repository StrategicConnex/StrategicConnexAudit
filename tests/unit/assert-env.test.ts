import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { assertNotProd, assertCleanupPlan, targetFromEnv } from "../../scripts/lib/assert-env.mjs";

const ENV_KEYS = [
  "NODE_ENV",
  "APP_ENV",
  "VERCEL_ENV",
  "DATABASE_URL",
  "DIRECT_URL",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
] as const;

describe("assert-not-prod (Fase 2)", () => {
  let snapshot: Record<string, string | undefined>;
  let argv: string[];

  beforeEach(() => {
    snapshot = {};
    for (const key of ENV_KEYS) snapshot[key] = process.env[key];
    argv = process.argv;
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (snapshot[key] === undefined) delete process.env[key];
      else process.env[key] = snapshot[key];
    }
    process.argv = argv;
  });

  it("bloquea producción detectada por APP_ENV sin flag", () => {
    process.env.APP_ENV = "production";
    process.argv = ["node", "script.ts"];
    expect(() => assertNotProd("t")).toThrow(/PRODUCCIÓN/);
    expect(() => assertNotProd("t")).toThrow(/bloqueada en producción/);
  });

  it("bloquea producción detectada por NODE_ENV sin flag", () => {
    process.env.NODE_ENV = "production";
    process.argv = ["node", "script.ts"];
    expect(() => assertNotProd("t")).toThrow(/PRODUCCIÓN/);
  });

  it("bloquea producción detectada por el DSN de producción", () => {
    delete process.env.NODE_ENV;
    delete process.env.APP_ENV;
    process.env.DATABASE_URL = "postgres://u:p@db.scaudit.vercel.app:5432/postgres";
    process.argv = ["node", "script.ts"];
    expect(() => assertNotProd("t")).toThrow(/PRODUCCIÓN/);
  });

  it("bloquea producción detectada por la URL pasada explícitamente", () => {
    process.argv = ["node", "script.mjs"];
    expect(() => assertNotProd("post-rls-check", { url: "https://scaudit.vercel.app" })).toThrow(
      /PRODUCCIÓN/
    );
    expect(targetFromEnv({ url: "https://scaudit.vercel.app" })).toBe("production");
  });

  it("permite producción con --allow-prod", () => {
    process.env.APP_ENV = "production";
    process.argv = ["node", "script.ts", "--allow-prod"];
    expect(() => assertNotProd("t")).not.toThrow();
    expect(assertNotProd("t")).toBe("production");
  });

  it("no bloquea development ni staging", () => {
    process.env.APP_ENV = "development";
    process.env.DATABASE_URL = "postgres://localhost:5432/dev";
    process.argv = ["node", "script.ts"];
    expect(() => assertNotProd("t")).not.toThrow();

    process.env.APP_ENV = "staging";
    expect(() => assertNotProd("t")).not.toThrow();
  });
});

describe("assert-cleanup-plan (Fase 2)", () => {
  let argv: string[];

  beforeEach(() => {
    argv = process.argv;
  });

  afterEach(() => {
    process.argv = argv;
  });

  it("limpia por defecto", () => {
    process.argv = ["node", "script.ts"];
    expect(assertCleanupPlan("t")).toBe(true);
  });

  it("--no-cleanup sin --allow-prod se rechaza", () => {
    process.argv = ["node", "script.ts", "--no-cleanup"];
    expect(() => assertCleanupPlan("t")).toThrow(/--no-cleanup sólo se permite/);
  });

  it("--no-cleanup con --allow-prod desactiva la limpieza", () => {
    process.argv = ["node", "script.ts", "--no-cleanup", "--allow-prod"];
    expect(assertCleanupPlan("t")).toBe(false);
  });
});
