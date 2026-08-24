/* ═══════════════════════════════════════════════════════════════════════════
   Health público — Tests de endpoint

   Verifica (corrección 2026-08-10):
   - dbConfigured refleja la CONFIG REAL de la app: DATABASE_URL (pg server-side
     vía drizzle) + NEXT_PUBLIC_SUPABASE_URL (cliente Supabase Auth).
   - SUPABASE_SERVICE_ROLE_KEY ya NO cuenta: la fábrica admin client fue
     eliminada y ninguna ruta usa service-role; la var nunca estuvo en Vercel
     → producía un 503 `degraded` permanente en el health público.
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Health público — /api/public/v1/health", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.unstubAllEnvs();
    const mod = await import("./route");
    GET = mod.GET;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("config completa (DATABASE_URL + NEXT_PUBLIC_SUPABASE_URL + Redis) → 200 ok", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@host:5432/db");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.services).toEqual({ redisConfigured: true, dbConfigured: true });
  });

  it("REGRESIÓN: SUPABASE_SERVICE_ROLE_KEY NO hace dbConfigured true (var muerta)", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-secret");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    // Sin DATABASE_URL ni NEXT_PUBLIC_SUPABASE_URL → DB NO configurada.

    const res = await GET();
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.services.dbConfigured).toBe(false);
    expect(body.services.redisConfigured).toBe(true);
  });

  it("DATABASE_URL presente sin NEXT_PUBLIC_SUPABASE_URL → degraded (faltan ambas de la pareja)", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@host:5432/db");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");

    const res = await GET();
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.services.dbConfigured).toBe(false);
  });

  it("sin Redis ni DB → 503 down", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");

    const res = await GET();
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.status).toBe("down");
    expect(body.services).toEqual({ redisConfigured: false, dbConfigured: false });
  });
});
