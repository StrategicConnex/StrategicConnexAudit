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

  it("getters failover existen (opcional); los legados eliminados ya no (Bearer/Xiaomi/Anthropic)", async () => {
    // Enmienda anti-monodependencia 2026-10-19: Groq/Gemini VUELVEN como
    // failover opcional con claves nuevas verificadas en vivo (la GEMINI de
    // 2026-10-17, filtrada, fue eliminada — la actual es otra credential).
    // Los legados muertos siguen fuera (AI-CONNECTIONS-REPORT.md).
    const { envSecrets } = await import("./env-secrets");
    expect("groqApiKey" in envSecrets).toBe(true);
    expect("geminiApiKey" in envSecrets).toBe(true);
    expect("bearerApiKey" in envSecrets).toBe(false);
    expect("aiBaseUrl" in envSecrets).toBe(false);
    expect("anthropicApiKey" in envSecrets).toBe(false);
    // Defaults de failover activos sin variable: usable out-of-the-box.
    expect(envSecrets.groqBaseUrl).toBe("https://api.groq.com/openai/v1");
    expect(envSecrets.geminiBaseUrl).toBe(
      "https://generativelanguage.googleapis.com/v1beta/openai"
    );
    // Sin variable: cadenas vacías, el router salta al proveedor siguiente.
    expect(envSecrets.groqApiKey).toBe("");
    expect(envSecrets.geminiApiKey).toBe("");
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
