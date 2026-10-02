/**
 * instrumentation — fail-fast de variables de entorno en el arranque.
 *
 * Verifica que register() valida en runtime nodejs, se salta en edge y en
 * fase de build, y aborta el arranque si falta una variable requerida.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { register } from "./instrumentation";

const REQUIRED_VALID = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  DIRECT_URL: "postgresql://user:pass@localhost:5432/db",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
  OPENROUTER_API_KEY: "sk-or-test",
};

function stubValidEnv(): void {
  for (const [key, value] of Object.entries(REQUIRED_VALID)) {
    vi.stubEnv(key, value);
  }
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", undefined);
}

describe("instrumentation register — validación de env", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PHASE", "phase-production-server");
    stubValidEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("arranca con las variables requeridas válidas", async () => {
    await expect(register()).resolves.toBeUndefined();
  });

  it("arranca con el alias ANON legacy cuando falta la PUBLISHABLE", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", undefined);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

    await expect(register()).resolves.toBeUndefined();
  });

  it("aborta el arranque si faltan las dos claves Supabase", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", undefined);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(register()).rejects.toThrow();
  });

  it("aborta el arranque si falta una variable requerida", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(register()).rejects.toThrow();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("aborta el arranque si una variable tiene formato inválido", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "not-a-url");
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(register()).rejects.toThrow();
  });

  it("se salta en el runtime edge (el proxy no valida aquí)", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    vi.stubEnv("DATABASE_URL", "");
    await expect(register()).resolves.toBeUndefined();
  });

  it("se salta durante la fase de build (CI/Vercel sin secrets)", async () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.stubEnv("DATABASE_URL", "");
    await expect(register()).resolves.toBeUndefined();
  });
});
