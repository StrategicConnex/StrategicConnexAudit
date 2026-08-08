/**
 * Config de entorno PÚBLICA — segura para importar desde el navegador.
 *
 * RULE-001 v3.1: los secretos (service role, DATABASE_URL, API keys IA, etc.)
 * viven en `env-secrets.ts` y NUNCA deben importarse desde código de cliente.
 * Este módulo solo expone valores `NEXT_PUBLIC_*` (seguros para el bundle).
 */
export const env = {
  get supabaseUrl() {
    return process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  },
  // CS-301 fix: nombre canónico NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY con alias
  // de compatibilidad NEXT_PUBLIC_SUPABASE_ANON_KEY (leer uno, fallback al otro).
  get supabaseAnonKey() {
    return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  },
};
