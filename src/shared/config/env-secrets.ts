import "server-only";

/**
 * SECRETOS — NUNCA importar desde componentes o código de navegador.
 *
 * RULE-001 v3.1: separado de `env.ts` (que sí importa el cliente vía
 * `src/shared/lib/supabase/client.ts`) para que los getters de credenciales
 * privilegiadas NO viajen en el bundle del navegador.
 *
 * Solo los módulos server-side (rutas API, jobs, libs de servidor) deben
 * importar este archivo.
 */
export const envSecrets = {
  get supabaseServiceKey() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  },
  get databaseUrl() {
    return process.env.DATABASE_URL || "";
  },
  get directUrl() {
    return process.env.DIRECT_URL || "";
  },
  get triggerSecretKey() {
    return process.env.TRIGGER_SECRET_KEY || "";
  },
  get openRouterApiKey() {
    return process.env.OPENROUTER_API_KEY || "";
  },
  get openRouterBaseUrl() {
    return process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
  },
  // P1-5: clave de cifrado de secretos en reposo (32 bytes hex).
  get dataEncryptionKey() {
    return process.env.DATA_ENCRYPTION_KEY || "";
  },
};

/*
 * PROVEEDORES DE IA: sólo OpenRouter (único proveedor del pool).
 *
 * Simplificación 2026-10-18 (decisión APROBADA): failover inter-proveedor
 * P2-1 eliminado junto a `src/server/ai/providers.ts` — sin ANTHROPIC_API_KEY
 * nunca estuvo activo en runtime y OpenRouter concentra la resiliencia
 * (meta-modelo + cadena :free por tarea). Trade-off aceptado: si OpenRouter
 * cae por completo, no hay failover externo.
 *
 * Eliminados el 2026-10-17 tras medirlos en vivo con
 * `tests/integration/ai-real-connections.test.ts`:
 *   · GEMINI_API_KEY  → Google la rechaza: «Your API key was reported as leaked»
 *   · BEARER_API_KEY / Bearer_API_KEY y XIAOMI_BASE_URL → apifreellm: «Incorrect API key»
 *   · NVIDIA_API_KEY nunca tuvo getter (404 «Function not found for account»)
 * Ver tests/integration/AI-CONNECTIONS-REPORT.md.
 */
