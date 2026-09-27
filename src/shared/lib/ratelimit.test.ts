import { describe, it, expect, vi, beforeEach } from "vitest";

// ==== Test: checkAiRateLimit (sliding window en memoria) ====

describe("checkAiRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    // Cada test recarga el módulo: el Map de ventanas vuelve a estar vacío
    vi.resetModules();
  });

  it("aplica el limite 5/60s en memoria y nunca falla cerrado", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const mod = await import("./ratelimit");

    for (let i = 0; i < 5; i++) {
      const ok = await mod.checkAiRateLimit("user-1");
      expect(ok.success).toBe(true);
      expect(ok.limit).toBe(5);
      expect(ok.remaining).toBe(4 - i);
    }

    const blocked = await mod.checkAiRateLimit("user-1");
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("es identificador-local: un usuario bloqueado no afecta a otro", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const mod = await import("./ratelimit");

    for (let i = 0; i < 5; i++) await mod.checkAiRateLimit("alice");
    expect((await mod.checkAiRateLimit("alice")).success).toBe(false);

    const bob = await mod.checkAiRateLimit("bob");
    expect(bob.success).toBe(true);
    expect(bob.remaining).toBe(4);
  });

  it("funciona igual en development (sin dependencias de entorno)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const mod = await import("./ratelimit");

    const result = await mod.checkAiRateLimit("user-dev");
    expect(result.success).toBe(true);
    expect(result.limit).toBe(5);
    expect(result.remaining).toBe(4);
  });

  it("las cuotas diarias por task respetan su limite y ventana 86400s", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const mod = await import("./ratelimit");

    const limit = mod.AI_DAILY_QUOTAS["seo-report"];
    for (let i = 0; i < limit; i++) {
      expect((await mod.checkAiDailyQuota("user-q", "seo-report")).success).toBe(true);
    }

    const blocked = await mod.checkAiDailyQuota("user-q", "seo-report");
    expect(blocked.success).toBe(false);
    expect(blocked.limit).toBe(limit);
    expect(blocked.retryAfter).toBeGreaterThan(0);

    // Otra task tiene su propia ventana/prefijo
    expect((await mod.checkAiDailyQuota("user-q", "general-chat")).success).toBe(true);
  });

  it("el checkEmailRateLimit usa su propio limite de 40/60s", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const mod = await import("./ratelimit");

    const first = await mod.checkEmailRateLimit("203.0.113.7");
    expect(first.success).toBe(true);
    expect(first.limit).toBe(40);
    expect(first.remaining).toBe(39);

    const callback = await mod.checkCallbackRateLimit("203.0.113.7");
    expect(callback.limit).toBe(10);
    expect(callback.remaining).toBe(9);
  });
});

// ==== Test: isEmailAllowlisted ====

describe("isEmailAllowlisted", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("devuelve true para el email hardcodeado en la allowlist", async () => {
    const mod = await import("./ratelimit");
    expect(mod.isEmailAllowlisted("palacios_juan@hotmail.com")).toBe(true);
  });

  it("normaliza mayusculas y espacios antes de comparar", async () => {
    const mod = await import("./ratelimit");
    expect(mod.isEmailAllowlisted("  PALACIOS_JUAN@Hotmail.COM  ")).toBe(true);
    expect(mod.isEmailAllowlisted("Palacios_Juan@hotmail.com")).toBe(true);
  });

  it("respeta AUTH_EMAIL_ALLOWLIST con multiples emails separados por coma", async () => {
    vi.stubEnv("AUTH_EMAIL_ALLOWLIST", " admin@corp.com ,  otro@test.io ");
    const mod = await import("./ratelimit");

    expect(mod.isEmailAllowlisted("admin@corp.com")).toBe(true);
    expect(mod.isEmailAllowlisted("OTRO@test.io")).toBe(true);
    expect(mod.isEmailAllowlisted("palacios_juan@hotmail.com")).toBe(true);
    expect(mod.isEmailAllowlisted("nobody@example.com")).toBe(false);
  });

  it("ignora entradas vacias de AUTH_EMAIL_ALLOWLIST (comas dobles o espacios)", async () => {
    vi.stubEnv("AUTH_EMAIL_ALLOWLIST", " , , admin@corp.com , ");
    const mod = await import("./ratelimit");

    expect(mod.isEmailAllowlisted("admin@corp.com")).toBe(true);
    expect(mod.isEmailAllowlisted("palacios_juan@hotmail.com")).toBe(true);
    expect(mod.isEmailAllowlisted("other@corp.com")).toBe(false);
  });

  it("normaliza mayusculas tambien en los valores de AUTH_EMAIL_ALLOWLIST", async () => {
    vi.stubEnv("AUTH_EMAIL_ALLOWLIST", "Admin@Corp.com,  OTRO@TEST.IO ");
    const mod = await import("./ratelimit");

    expect(mod.isEmailAllowlisted("admin@corp.com")).toBe(true);
    expect(mod.isEmailAllowlisted("otro@test.io")).toBe(true);
  });

  it("devuelve false para email vacio, null o undefined", async () => {
    const mod = await import("./ratelimit");

    expect(mod.isEmailAllowlisted("")).toBe(false);
    expect(mod.isEmailAllowlisted("   ")).toBe(false);
    expect(mod.isEmailAllowlisted(null)).toBe(false);
    expect(mod.isEmailAllowlisted(undefined)).toBe(false);
  });

  it("email vacio devuelve false incluso con AUTH_EMAIL_ALLOWLIST configurada (early-return)", async () => {
    vi.stubEnv("AUTH_EMAIL_ALLOWLIST", "admin@corp.com");
    const mod = await import("./ratelimit");

    expect(mod.isEmailAllowlisted("")).toBe(false);
    expect(mod.isEmailAllowlisted(null)).toBe(false);
  });

  it("devuelve false para emails no listados sin env var configurada", async () => {
    const mod = await import("./ratelimit");

    expect(mod.isEmailAllowlisted("random@user.com")).toBe(false);
    expect(mod.isEmailAllowlisted("PALACIOS@hotmail.com")).toBe(false); // no es el email exacto
  });
});
