import { createClient } from "@/shared/lib/supabase/server";
import { AuthError } from "@/server/lib/app-error";
import type { User } from "@supabase/supabase-js";

/**
 * Usuario sintético de desarrollo. Debe coincidir con `DEV_BYPASS_USER_ID`
 * de `@/shared/lib/actions` — si divergen, las escrituras del bypass crean
 * filas con un owner_id que ninguna lectura puede ver.
 */
const DEV_BYPASS_USER_ID = "00000000-0000-0000-0000-000000000001";

/**
 * El dev-bypass cubre SOLO `NODE_ENV=development` Y la opt-in explícita por
 * env. Mismas dos condiciones que evalúa `authenticatedAction`, para que
 * lectura y escritura no puedan discrepar.
 */
function isDevBypassEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true"
  );
}

/** Usuario sintético con la misma forma que devuelve `supabase.auth.getUser()`. */
function buildDevBypassUser(): User {
  return {
    id: DEV_BYPASS_USER_ID,
    email: "dev@localhost.dev",
    user_metadata: { full_name: "Dev Bypass User" },
    app_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
    role: "authenticated",
  } as User;
}

export async function getCurrentUser(): Promise<User | null> {
  // Sin sesión real, `supabase.auth.getUser()` devuelve null y toda lectura
  // posterior revienta con AuthError aunque las escrituras sí hayan persistido.
  if (isDevBypassEnabled()) {
    return buildDevBypassUser();
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user || null;
  } catch {
    return null;
  }
}

export async function getCurrentUserOrThrow(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthError();
  }
  return user;
}