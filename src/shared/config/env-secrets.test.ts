import { describe, it, expect, vi, beforeEach } from "vitest";

describe("env-secrets — getters server-only (RULE-001)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("expone cada secreto desde process.env", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "svc-key");
    vi.stubEnv("DATABASE_URL", "postgres://db");
    vi.stubEnv("DIRECT_URL", "postgres://direct");
    vi.stubEnv("TRIGGER_SECRET_KEY", "tr_secret");
    vi.stubEnv("GEMINI_API_KEY", "gemini-key");
    vi.stubEnv("BEARER_API_KEY", "bearer-key");
    vi.stubEnv("XIAOMI_BASE_URL", "https://ai.internal");
    vi.stubEnv("OPENROUTER_API_KEY", "or-key");

    const { envSecrets } = await import("./env-secrets");
    expect(envSecrets.supabaseServiceKey).toBe("svc-key");
    expect(envSecrets.databaseUrl).toBe("postgres://db");
    expect(envSecrets.directUrl).toBe("postgres://direct");
    expect(envSecrets.triggerSecretKey).toBe("tr_secret");
    expect(envSecrets.geminiApiKey).toBe("gemini-key");
    expect(envSecrets.bearerApiKey).toBe("bearer-key");
    expect(envSecrets.aiBaseUrl).toBe("https://ai.internal");
    expect(envSecrets.openRouterApiKey).toBe("or-key");
  });

  it("devuelve cadena vacía para secretos no definidos (sin lanzar)", async () => {
    const { envSecrets } = await import("./env-secrets");
    expect(envSecrets.supabaseServiceKey).toBe("");
    expect(envSecrets.databaseUrl).toBe("");
    expect(envSecrets.geminiApiKey).toBe("");
  });

  it("bearerApiKey: usa el alias legacy Bearer_API_KEY cuando falta el canónico", async () => {
    const { envSecrets } = await import("./env-secrets");
    vi.stubEnv("Bearer_API_KEY", "legacy-key");
    expect(envSecrets.bearerApiKey).toBe("legacy-key");
  });

  // NOTA: en Windows las env vars son case-insensitive, así que NO se pueden
  // stubbear BEARER_API_KEY y Bearer_API_KEY a la vez (la segunda sobrescribe
  // la primera). En Linux/Vercel son variables distintas y el canónico gana.
  it("bearerApiKey: devuelve el canónico BEARER_API_KEY cuando está definido", async () => {
    const { envSecrets } = await import("./env-secrets");
    vi.stubEnv("BEARER_API_KEY", "canonical-key");
    expect(envSecrets.bearerApiKey).toBe("canonical-key");
  });

  it("openRouterBaseUrl tiene default público sin variable", async () => {
    const { envSecrets } = await import("./env-secrets");
    vi.stubEnv("OPENROUTER_BASE_URL", "");
    expect(envSecrets.openRouterBaseUrl).toBe("https://openrouter.ai/api/v1");
    vi.stubEnv("OPENROUTER_BASE_URL", "https://proxy.local/v1");
    expect(envSecrets.openRouterBaseUrl).toBe("https://proxy.local/v1");
  });
});
