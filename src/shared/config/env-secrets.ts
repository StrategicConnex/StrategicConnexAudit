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
  // ── Failover anti-monodependencia (decisión owner 2026-10-19) ──────────
  // Ambos son ENDPOINTS COMPATIBLES OpenAI (chat/completions): Groq con
  // formato nuevo de credencial (AQ.*) y Gemini vía v1beta/openai.
  // Sin key → el proveedor se salta en el failover (sin error).
  get groqApiKey() {
    return process.env.GROQ_API_KEY || "";
  },
  get groqBaseUrl() {
    return process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
  },
  get geminiApiKey() {
    return process.env.GEMINI_API_KEY || "";
  },
  get geminiBaseUrl() {
    return process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai";
  },
  // P1-5: clave de cifrado de secretos en reposo (32 bytes hex).
  get dataEncryptionKey() {
    return process.env.DATA_ENCRYPTION_KEY || "";
  },
};

/*
 * PROVEEDORES DE IA: OpenRouter (primario) + Groq y Gemini (failover).
 *
 * 2026-10-18 — decisión APROBADA: pool OpenRouter-only; failover inter-proveedor
 * P2-1 (Anthropic) eliminado junto a `src/server/ai/providers.ts`.
 *
 * 2026-10-19 — enmienda del owner (anti-monodependencia, RSK del análisis de
 * auditoría): se restituye el failover SIN resucitar providers.ts. Groq y
 * Gemini entran como CHAIN DE FAILOVER tras agotarse la cadena OpenRouter
 * de la tarea, con endpoints compatibles OpenAI y llaves verificadas EN VIVO:
 *   · GROQ_API_KEY  → gpt-oss-120b: chat ✅ json_object ✅ tools ✅ (0.65-1.1s;
 *     reasoning_effort: "low"; "none" → 400: VERIFICADO)
 *   · GEMINI_API_KEY → gemini-3.8-flash (endpoint /v1beta/openai): chat ✅
 *     json_object ✅ tools ✅ Bearer ✅ (~2.9-4s). Clave nueva (formato AQ.*)
 *     tras el incidente 2026-10-17 de la clave filtrada.
 * Sin key configurada el proveedor se omite: el degrade es silencioso y el
 * guard de env-parity del healthcheck reporta ambos booleanos.
 */

