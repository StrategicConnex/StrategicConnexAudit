export const env = {
  get supabaseUrl() { 
    return process.env.NEXT_PUBLIC_SUPABASE_URL || ""; 
  },
  get supabaseAnonKey() { 
    return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ""; 
  },
  get supabaseServiceKey() { return process.env.SUPABASE_SERVICE_ROLE_KEY || ""; },
  get databaseUrl() { return process.env.DATABASE_URL || ""; },
  get directUrl() { return process.env.DIRECT_URL || ""; },
  get triggerSecretKey() { return process.env.TRIGGER_SECRET_KEY || ""; },
  get geminiApiKey() { return process.env.GEMINI_API_KEY || ""; },
  get bearerApiKey() { return process.env.Bearer_API_KEY || ""; },
  get aiBaseUrl() { return process.env.XIAOMI_BASE_URL || "https://apifreellm.com/api/v1/chat"; },
  get openRouterApiKey() { return process.env.OPENROUTER_API_KEY || ""; },
  get openRouterBaseUrl() { return process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1"; },
};
