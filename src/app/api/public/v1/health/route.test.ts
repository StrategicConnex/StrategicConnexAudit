/* ═══════════════════════════════════════════════════════════════════════════
   Health público — Tests de endpoint

   Verifica (corrección 2026-08-10):
   - dbConfigured refleja la CONFIG REAL de la app: DATABASE_URL (pg server-side
     vía drizzle) + NEXT_PUBLIC_SUPABASE_URL (cliente Supabase Auth).
   - SUPABASE_SERVICE_ROLE_KEY ya NO cuenta: la fábrica admin client fue
     eliminada y ninguna ruta usa service-role; la var nunca estuvo en Vercel
     → producía un 503 `degraded` permanente en el health público.
   - rateLimitStore expone el store del rate limit activo (ADR-002 enm. 15):
     `postgres` en producción, `memory` fuera de ella (o el override
     RATE_LIMIT_STORE).
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

  it("config completa (DATABASE_URL + NEXT_PUBLIC_SUPABASE_URL) → 200 ok", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@host:5432/db");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.services.dbConfigured).toBe(true);
    expect(body.services.rateLimitStore).toMatch(/^(postgres|memory)$/);
    expect(body.services.errorSink).toMatch(/^(app_logs|disabled)$/);
  });

  it("NODE_ENV=production → errorSink es app_logs (ADR-007)", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@host:5432/db");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("NODE_ENV", "production");

    const res = await GET();
    const body = await res.json();
    expect(body.services.errorSink).toBe("app_logs");
  });

  it("REGRESIÓN: SUPABASE_SERVICE_ROLE_KEY NO hace dbConfigured true (var muerta)", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-secret");
    // Sin DATABASE_URL ni NEXT_PUBLIC_SUPABASE_URL → DB NO configurada.

    const res = await GET();
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.status).toBe("down");
    expect(body.services.dbConfigured).toBe(false);
    expect(body.services.rateLimitStore).toMatch(/^(postgres|memory)$/);
  });

  it("DATABASE_URL presente sin NEXT_PUBLIC_SUPABASE_URL → degraded (faltan ambas de la pareja)", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@host:5432/db");

    const res = await GET();
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.services.dbConfigured).toBe(false);
  });

  it("sin configuración alguna → 503 down", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");

    const res = await GET();
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.status).toBe("down");
    expect(body.services.dbConfigured).toBe(false);
    expect(body.services.rateLimitStore).toMatch(/^(postgres|memory)$/);
  });
});
