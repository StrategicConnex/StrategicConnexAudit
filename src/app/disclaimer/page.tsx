import { createClient } from '@/shared/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Info, Shield } from 'lucide-react';

export const metadata = {
  title: 'Aviso Legal - StrategicAudit Pro',
  description:
    'Aviso legal de StrategicAudit Pro. La plataforma se encuentra en fase beta; algunas funcionalidades están siendo probadas antes de su lanzamiento completo.',
};

const translations = {
  es: {
    title: 'Aviso Legal',
    intro:
      'Este producto está actualmente en fase beta. Algunas funcionalidades pueden estar siendo probadas activamente antes de su lanzamiento completo.',
    bullets: [
      'Funcionalidades en prueba activa',
      'Posibles errores o comportamientos inesperados',
      'Cambios sin previo aviso',
      'El servicio se proporciona "tal cual" durante este período de pruebas',
    ],
    reportTitle: 'Reportar un problema',
    reportIntro:
      'Si encuentras algún error o problema de seguridad, por favor repórtalo inmediatamente a:',
    reportHint:
      'Incluye en tu reporte: descripción del problema, pasos para reproducirlo, capturas de pantalla si aplica y navegador/version utilizada.',
    acceptLabel: 'He leído y acepto los términos del aviso legal',
    accept: 'Aceptar',
    updated: 'Última actualización: Octubre 2026',
  },
  en: {
    title: 'Legal Notice',
    intro:
      'This product is currently in beta phase. Some features may be unstable and subject to change without notice.',
    bullets: [
      'Features under active testing',
      'Possible errors or unexpected behavior',
      'Changes without prior notice',
      'The service is provided "as is" during this testing period',
    ],
    reportTitle: 'Report an issue',
    reportIntro:
      'If you encounter any errors, unexpected behaviors, or security issues while using the platform, please report them immediately to:',
    reportHint:
      'Include in your report: problem description, steps to reproduce, screenshots if applicable, and browser/version used.',
    acceptLabel: 'I have read and accept the terms of the legal notice',
    accept: 'Accept',
    updated: 'Last updated: October 2026',
  },
};

export default async function DisclaimerPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { getLocale } = await import('@/i18n/request');
  const currentLocale = await getLocale();
  const t = translations[currentLocale === 'en' ? 'en' : 'es'];

  const redirectTo = (await searchParams).redirect ?? '/dashboard';

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
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
          Este producto está en{' '}
          <a
            href="/disclaimer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            fase beta
          </a>
          {' '}y puede contener cambios sin previo aviso. Consultá el{' '}
          <a
            href="/disclaimer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            aviso legal
          </a>
          {' '}para más detalles.
        </span>
      </div>
      <main className="flex min-h-[calc(100vh-64px)] flex-col items-center justify-center p-6">
        <div className="w-full max-w-2xl space-y-6">
          <div className="flex items-center gap-3 text-primary">
            <Shield className="h-8 w-8" aria-hidden />
            <h1 className="text-2xl font-bold text-foreground">
              {t.title}
            </h1>
          </div>

          <div className="rounded-lg border border-border p-6 text-balance">
            <p className="text-muted-foreground">{t.intro}</p>
            <ul className="mt-4 space-y-2 text-muted-foreground">
              {t.bullets.map((bullet) => (
                <li key={bullet} className="list-none pl-6 leading-relaxed">
                  <span className="text-primary/80">•</span> {bullet}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-border bg-surface p-6 text-balance">
            <h2 className="font-semibold text-foreground">
              {t.reportTitle}
            </h2>
            <p className="mt-2 text-muted-foreground">{t.reportIntro}</p>
            <a
              href="mailto:palacios_juan@hotmail.com"
              className="mt-3 inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 font-medium text-foreground text-sm transition-colors hover:bg-card/80 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <Info className="h-4 w-4" aria-hidden />
              palacios_juan@hotmail.com
            </a>
            <p className="mt-3 text-xs text-muted-foreground">{t.reportHint}</p>
          </div>

          <form
            action={async () => {
              // acceptDisclaimer removed - TBD
            }}
            className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-sm"
          >
            <Checkbox id="disclaimer-accept" />
            <label
              htmlFor="disclaimer-accept"
              className="flex-1 cursor-pointer text-muted-foreground"
            >
              {t.acceptLabel}
            </label>
            <Button type="submit">{t.accept}</Button>
          </form>

          <p className="text-xs text-muted-foreground text-center">
            {t.updated}
          </p>
        </div>
      </main>
    </>
  );
}
