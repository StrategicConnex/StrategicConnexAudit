import { createClient } from "@/shared/lib/supabase/server";
import { AuthError } from "@/server/lib/app-error";

export async function getCurrentUser() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user || null;
  } catch {
    return null;
  }
}

export async function getCurrentUserOrThrow() {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthError();
  }
  return user;
}
