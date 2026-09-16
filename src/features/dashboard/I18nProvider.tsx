"use client";

import { NextIntlClientProvider } from "next-intl";
import { ReactNode } from "react";
import type { Locale } from "@/i18n/request";

/**
 * Client-side i18n provider that wraps NextIntlClientProvider.
 * This avoids the server-side config file requirement of the next-intl plugin.
 * El locale y los mensajes los resuelve el layout servidor (cookie NEXT_LOCALE
 * → Accept-Language → 'es'), así el LanguageSwitcher sí cambia el idioma.
 */
export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Record<string, unknown>;
  children: ReactNode;
}) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      // Sin esto next-intl cae en ENVIRONMENT_FALLBACK (UTC server vs tz local
      // del cliente) → warning y riesgo de markup mismatch en fechas.
      timeZone="America/Argentina/Buenos_Aires"
    >
      {children}
    </NextIntlClientProvider>
  );
}
