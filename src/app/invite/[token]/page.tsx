import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/shared/lib/supabase/server";
import { acceptInvitation } from "@/server/lib/invitations";

export const dynamic = "force-dynamic";

/**
 * GET /invite/[token] — acepta una invitación de equipo (A-2).
 * Sin sesión → login con retorno aquí. Token inválido/vencido → mensaje.
 */
export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/invite/${token}`);
  }

  const result = await acceptInvitation(token, user.id);

  if (!result.ok) {
    return (
      <div className="min-h-dvh w-full flex items-center justify-center bg-background p-6">
        <div className="glass-card p-8 max-w-md text-center space-y-4">
          <h1 className="text-xl font-bold text-foreground">Invitación no válida</h1>
          <p className="text-sm text-muted-fg">{result.error}</p>
          <Link href="/" className="inline-block px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold">
            Ir al inicio
          </Link>
        </div>
      </div>
    );
  }

  redirect("/");
}
