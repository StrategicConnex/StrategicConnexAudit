import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/shared/config/env";

// This client must ONLY be used in secure server environments
// like Server Actions or Trigger.dev jobs, never exposed to the client.
export function createAdminClient() {
  return createSupabaseClient(
    env.supabaseUrl,
    env.supabaseServiceKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
