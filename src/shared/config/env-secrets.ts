import 'server-only';

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
  get openRouterApiKey() { return process.env.OPENROUTER_API_KEY || ""; },
  get openRouterBaseUrl() { return process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1"; },
  // P2-1: failover inter-proveedor (opcional; sin key todo sigue en OpenRouter).
  get anthropicApiKey() { return process.env.ANTHROPIC_API_KEY || ""; },
  // P1-5: clave de cifrado de secretos en reposo (32 bytes hex).
  get dataEncryptionKey() { return process.env.DATA_ENCRYPTION_KEY || ""; },
};

/*
 * PROVEEDORES DE IA: sólo OpenRouter (primario) y Anthropic (failover P2-1).
 *
 * Eliminados el 2026-10-17 tras medirlos en vivo con
 * `tests/integration/ai-real-connections.test.ts`:
 *   · GEMINI_API_KEY  → Google la rechaza: «Your API key was reported as leaked»
 *   · BEARER_API_KEY / Bearer_API_KEY y XIAOMI_BASE_URL → apifreellm: «Incorrect API key»
 * Los tres getters no tenían NINGÚN consumidor en runtime — sólo su propio
 * test — y su existencia sugería failovers que el producto no tiene.
 * `NVIDIA_API_KEY` nunca tuvo getter: se sigue probando en el test de conexiones.
 * Ver tests/integration/AI-CONNECTIONS-REPORT.md.
 */
