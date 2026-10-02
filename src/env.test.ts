/* ═══════════════════════════════════════════════════════════════════════════
   Env Validation — Tests del esquema Zod de src/env.ts

   Verifica que:
   - validateEnv() acepta un entorno completo y devuelve las 9 variables.
   - La clave Supabase es obligatoria: PUBLISHABLE (canónica) o ANON (alias).
   - Una requerida faltante produce un ZodError que nombra el campo.
   - Las opcionales pueden ausentarse sin romper la validación.
   - Importar el módulo NO lanza en import-time (build en CI/Vercel).
   - El objeto exportado `env` conserva sus claves esperadas.
   ═════════════════════════════════════════════════════════════════════════ */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { env, envSchema, validateEnv } from "./env";

// ─── Fixture ────────────────────────────────────────────────────────────────

const REQUIRED_VARS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "OPENROUTER_API_KEY",
] as const;

/** Al menos una de las dos debe existir (PUBLISHABLE canónica ↔ ANON alias). */
const SUPABASE_KEY_VARS = [
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

const OPTIONAL_VARS = ["RESEND_API_KEY", "SLACK_WEBHOOK_URL", "TEAMS_WEBHOOK_URL"] as const;

const ALL_VARS = [...REQUIRED_VARS, ...SUPABASE_KEY_VARS, ...OPTIONAL_VARS] as const;

type VarKey = (typeof ALL_VARS)[number];

const VALID_VALUES: Record<VarKey, string> = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/strategicaudit",
  DIRECT_URL: "postgresql://user:pass@localhost:5432/strategicaudit",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiJ9.test-anon-key",
  OPENROUTER_API_KEY: "sk-or-v1-test-key",
  RESEND_API_KEY: "re_test_key",
  SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/T000/B000/XXX",
  TEAMS_WEBHOOK_URL: "https://outlook.office.com/webhook/xxx",
};

/** Fija todas las variables; las listadas en `unset` se borran de process.env. */
function stubEnvFixture(unset: readonly VarKey[] = []): void {
  for (const key of ALL_VARS) {
    vi.stubEnv(key, unset.includes(key) ? undefined : VALID_VALUES[key]);
  }
}

/** Captura el error lanzado por fn, o undefined si no lanzó. */
function catchFrom(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

// ─── validateEnv() ──────────────────────────────────────────────────────────

describe("validateEnv", () => {
  it("acepta un entorno completamente válido y devuelve las 9 variables", () => {
    stubEnvFixture();

    expect(validateEnv()).toEqual(VALID_VALUES);
  });

  it("acepta solo la clave PUBLISHABLE (canónica) sin el alias ANON", () => {
    stubEnvFixture(["NEXT_PUBLIC_SUPABASE_ANON_KEY"]);

    const parsed = validateEnv();

    expect(parsed.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe(
      VALID_VALUES.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    );
    expect(parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBeUndefined();
  });

  it("acepta solo el alias ANON (legacy) sin la PUBLISHABLE", () => {
    stubEnvFixture(["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]);

    const parsed = validateEnv();

    expect(parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe(VALID_VALUES.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    expect(parsed.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBeUndefined();
  });

  it("lanza ZodError si faltan las dos claves Supabase", () => {
    stubEnvFixture(SUPABASE_KEY_VARS);

    const error = catchFrom(() => validateEnv());

    expect(error).toBeInstanceOf(ZodError);
    const issues = (error as ZodError).issues;
    expect(issues.some((issue) => issue.path.includes("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"))).toBe(
      true,
    );
  });

  it.each(REQUIRED_VARS)("lanza ZodError nombrando el campo cuando falta %s", (key) => {
    stubEnvFixture([key]);

    const error = catchFrom(() => validateEnv());

    expect(error).toBeInstanceOf(ZodError);
    const issues = (error as ZodError).issues;
    expect(issues.some((issue) => issue.path.includes(key))).toBe(true);
  });

  it("rechaza una variable requerida con formato inválido", () => {
    stubEnvFixture();
    vi.stubEnv("DATABASE_URL", "not-a-url");

    const error = catchFrom(() => validateEnv());

    expect(error).toBeInstanceOf(ZodError);
    const issues = (error as ZodError).issues;
    expect(
      issues.some(
        (issue) => issue.path.includes("DATABASE_URL") && issue.code === "invalid_format",
      ),
    ).toBe(true);
  });

  it("permite que las variables opcionales no existan", () => {
    stubEnvFixture([...OPTIONAL_VARS]);

    const parsed = validateEnv();

    expect(Object.keys(parsed).sort()).toEqual([...REQUIRED_VARS, ...SUPABASE_KEY_VARS].sort());
    for (const key of OPTIONAL_VARS) {
      expect(parsed[key]).toBeUndefined();
    }
  });

  it("incluye las opcionales cuando sí están seteadas", () => {
    stubEnvFixture();

    const parsed = validateEnv();

    for (const key of OPTIONAL_VARS) {
      expect(parsed[key]).toBe(VALID_VALUES[key]);
    }
  });
});

// ─── Módulo src/env.ts ──────────────────────────────────────────────────────

describe("src/env.ts", () => {
  it("NO lanza en import-time aunque falten todas las variables", async () => {
    vi.resetModules();
    stubEnvFixture([...ALL_VARS]);

    await expect(import("./env")).resolves.toBeDefined();
  });

  it("exporta `env` con las 9 claves esperadas", () => {
    expect(Object.keys(env).sort()).toEqual([...ALL_VARS].sort());
  });

  it("exporta envSchema que valida el mismo conjunto de variables", () => {
    stubEnvFixture();

    expect(envSchema.safeParse(process.env).success).toBe(true);

    vi.stubEnv("OPENROUTER_API_KEY", undefined);
    const missing = envSchema.safeParse(process.env);

    expect(missing.success).toBe(false);
    if (missing.success) throw new Error("expected envSchema.safeParse to fail");
    expect(missing.error.issues.some((issue) => issue.path.includes("OPENROUTER_API_KEY"))).toBe(
      true,
    );
  });
});
