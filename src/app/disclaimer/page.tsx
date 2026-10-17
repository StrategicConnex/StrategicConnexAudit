import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Info, Shield } from "lucide-react";
import {
  DISCLAIMER_COOKIE,
  isDisclaimerPublicPath,
  resolveRedirectTarget,
  sanitizeRedirect,
} from "@/shared/lib/disclaimer";
import { DisclaimerForm } from "./DisclaimerForm";
import esMessages from "./es.json";
import enMessages from "./en.json";

export const metadata = {
  title: "Aviso Legal - StrategicAudit Pro",
  description:
    "Aviso legal de StrategicAudit Pro. La plataforma se encuentra en fase beta; algunas funcionalidades están siendo probadas antes de su lanzamiento completo.",
};

/**
 * `?redirect=` lo escribe el proxy con la ruta que el visitante intentó abrir.
 * Se re-sanitiza aquí porque es un parámetro de URL controlable por el usuario.
 */
function safeRedirect(candidate: string | null): string {
  if (sanitizeRedirect(candidate) === null) return "/login";
  const target = resolveRedirectTarget(candidate);
  // Nunca rebotar a la propia página del aviso: sería un bucle.
  if (isDisclaimerPublicPath(target) && target.startsWith("/disclaimer")) {
    return "/login";
  }
  return target;
}

export default async function DisclaimerPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { getLocale } = await import("@/i18n/request");
  const locale = await getLocale();
  const messages = (locale === "en" ? enMessages : esMessages).disclaimer;

  const redirectTo = safeRedirect((await searchParams).redirect ?? null);

  const cookieStore = await cookies();
  const disclaimerAccepted =
    cookieStore.get(DISCLAIMER_COOKIE)?.value === "true";

  const { createClient } = await import("@/shared/lib/supabase/server");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Un usuario con sesión que ya aceptó no necesita ver el aviso otra vez.
  // Sin la comprobación de la cookie, el proxy lo devolvería aquí y se
  // produciría un bucle redirect → /disclaimer → redirect.
  if (user && disclaimerAccepted) {
    redirect(redirectTo);
  }

  return (
    <>
      <div
        role="note"
        className="mx-auto max-w-3xl px-4 py-3 text-center text-sm text-muted-foreground"
      >
        <Info className="inline h-4 w-4 align-middle mr-1.5 text-foreground/60" />
        <span className="align-middle">
          Este producto está en{" "}
          <a
            href="/disclaimer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            fase beta
          </a>{" "}
          y puede contener cambios sin previo aviso. Consultá el{" "}
          <a
            href="/disclaimer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            aviso legal
          </a>{" "}
          para más detalles.
        </span>
      </div>
      <main className="flex min-h-[calc(100vh-64px)] flex-col items-center justify-center p-6">
        <div className="w-full max-w-2xl space-y-6">
          <div className="flex items-center gap-3 text-primary">
            <Shield className="h-8 w-8" aria-hidden />
            <h1 className="text-2xl font-bold text-foreground">
              {messages.title}
            </h1>
          </div>

          <div className="rounded-lg border border-border p-6 text-balance">
            <p className="text-muted-foreground">{messages.intro}</p>
            <ul className="mt-4 space-y-2 text-muted-foreground">
              {messages.bullets.map((bullet) => (
                <li key={bullet} className="list-none pl-6 leading-relaxed">
                  <span className="text-primary/80">•</span> {bullet}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-border bg-surface p-6 text-balance">
            <h2 className="font-semibold text-foreground">
              {messages.reportTitle}
            </h2>
            <p className="mt-2 text-muted-foreground">{messages.reportIntro}</p>
            <a
              href="mailto:palacios_juan@hotmail.com"
              className="mt-3 inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 font-medium text-foreground text-sm transition-colors hover:bg-card/80 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <Info className="h-4 w-4" aria-hidden />
              palacios_juan@hotmail.com
            </a>
            <p className="mt-3 text-xs text-muted-foreground">
              {messages.reportHint}
            </p>
          </div>

          <DisclaimerForm
            redirectTo={redirectTo}
            acceptLabel={messages.acceptLabel}
            submitLabel={messages.accept}
          />

          <p className="text-xs text-muted-foreground text-center">
            {messages.updated}
          </p>
        </div>
      </main>
    </>
  );
}
