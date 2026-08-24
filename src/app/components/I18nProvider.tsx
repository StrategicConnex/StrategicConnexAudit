"use client";

import { NextIntlClientProvider } from "next-intl";
import { ReactNode } from "react";
import esMessages from "../../../messages/es.json";

/**
 * Client-side i18n provider that wraps NextIntlClientProvider.
 * This avoids the server-side config file requirement of the next-intl plugin.
 * For now, hardcoded to Spanish. Dynamic locale switching will be added later.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider
      locale="es"
      messages={esMessages}
      // Sin esto next-intl cae en ENVIRONMENT_FALLBACK (UTC server vs tz local
      // del cliente) → warning y riesgo de markup mismatch en fechas.
      timeZone="America/Argentina/Buenos_Aires"
    >
      {children}
    </NextIntlClientProvider>
  );
}
