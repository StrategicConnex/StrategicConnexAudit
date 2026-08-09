import { describe, it, expect, vi, beforeEach } from "vitest";

describe("env — config pública segura para el navegador (RULE-001)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("expone NEXT_PUBLIC_SUPABASE_URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
    const { env } = await import("./env");
    expect(env.supabaseUrl).toBe("https://proj.supabase.co");
  });

  it("supabaseAnonKey: nombre canónico PUBLISHABLE_KEY con alias ANON_KEY legacy", async () => {
    const { env } = await import("./env");

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-legacy");
    expect(env.supabaseAnonKey).toBe("anon-legacy");

    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-canonical");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-legacy");
    expect(env.supabaseAnonKey).toBe("publishable-canonical");
  });

  it("devuelve cadena vacía sin variables (no lanza en build)", async () => {
    const { env } = await import("./env");
    expect(env.supabaseUrl).toBe("");
    expect(env.supabaseAnonKey).toBe("");
  });
});
