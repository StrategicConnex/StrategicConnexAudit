export const env = {
  get supabaseUrl() { 
    return process.env.NEXT_PUBLIC_SUPABASE_URL || ""; 
  },
  // CS-301 fix: nombre canónico NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY con alias
  // de compatibilidad NEXT_PUBLIC_SUPABASE_ANON_KEY (leer uno, fallback al otro).
  get supabaseAnonKey() { 
    return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""; 
  },
  get supabaseServiceKey() { return process.env.SUPABASE_SERVICE_ROLE_KEY || ""; },
  get databaseUrl() { return process.env.DATABASE_URL || ""; },
  get directUrl() { return process.env.DIRECT_URL || ""; },
  get triggerSecretKey() { return process.env.TRIGGER_SECRET_KEY || ""; },
  get geminiApiKey() { return process.env.GEMINI_API_KEY || ""; },
  // CS-302 fix: nombre canónico BEARER_API_KEY con alias legacy Bearer_API_KEY;
  // aiBaseUrl ya no tiene default oculto (el proveedor no documentado se elimina).
  get bearerApiKey() { return process.env.BEARER_API_KEY || process.env.Bearer_API_KEY || ""; },
  get aiBaseUrl() { return process.env.XIAOMI_BASE_URL || ""; },
  get openRouterApiKey() { return process.env.OPENROUTER_API_KEY || ""; },
  get openRouterBaseUrl() { return process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1"; },
};
