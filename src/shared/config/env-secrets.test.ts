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
    vi.stubEnv("OPENROUTER_API_KEY", "or-key");

    const { envSecrets } = await import("./env-secrets");
    expect(envSecrets.supabaseServiceKey).toBe("svc-key");
    expect(envSecrets.databaseUrl).toBe("postgres://db");
    expect(envSecrets.directUrl).toBe("postgres://direct");
    expect(envSecrets.triggerSecretKey).toBe("tr_secret");
    expect(envSecrets.openRouterApiKey).toBe("or-key");
  });

  it("devuelve cadena vacía para secretos no definidos (sin lanzar)", async () => {
    const { envSecrets } = await import("./env-secrets");
    expect(envSecrets.supabaseServiceKey).toBe("");
    expect(envSecrets.databaseUrl).toBe("");
  });

  it("los getters de IA eliminados ya no existen (Gemini/Bearer/Xiaomi/Anthropic)", async () => {
    // Medición en vivo + decisión 2026-10-18: Gemini/Bearer/Xiaomi sin conexión
    // y sin consumidor; Anthropic eliminado con el failover P2-1
    // (OpenRouter-only, ver AI-CONNECTIONS-REPORT.md).
    const { envSecrets } = await import("./env-secrets");
    expect("geminiApiKey" in envSecrets).toBe(false);
    expect("bearerApiKey" in envSecrets).toBe(false);
    expect("aiBaseUrl" in envSecrets).toBe(false);
    expect("anthropicApiKey" in envSecrets).toBe(false);
    // Lo que SÍ existe: el par del único proveedor activo.
    expect(envSecrets.openRouterApiKey).toBe("");
  });

  it("openRouterBaseUrl tiene default público sin variable", async () => {
    const { envSecrets } = await import("./env-secrets");
    vi.stubEnv("OPENROUTER_BASE_URL", "");
    expect(envSecrets.openRouterBaseUrl).toBe("https://openrouter.ai/api/v1");
    vi.stubEnv("OPENROUTER_BASE_URL", "https://proxy.local/v1");
    expect(envSecrets.openRouterBaseUrl).toBe("https://proxy.local/v1");
  });
});
