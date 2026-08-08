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
  get supabaseServiceKey() { return process.env.SUPABASE_SERVICE_ROLE_KEY || ""; },
  get databaseUrl() { return process.env.DATABASE_URL || ""; },
  get directUrl() { return process.env.DIRECT_URL || ""; },
  get triggerSecretKey() { return process.env.TRIGGER_SECRET_KEY || ""; },
  get geminiApiKey() { return process.env.GEMINI_API_KEY || ""; },
  // CS-302 fix: nombre canónico BEARER_API_KEY con alias legacy Bearer_API_KEY.
  get bearerApiKey() { return process.env.BEARER_API_KEY || process.env.Bearer_API_KEY || ""; },
  get aiBaseUrl() { return process.env.XIAOMI_BASE_URL || ""; },
  get openRouterApiKey() { return process.env.OPENROUTER_API_KEY || ""; },
  get openRouterBaseUrl() { return process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1"; },
};
