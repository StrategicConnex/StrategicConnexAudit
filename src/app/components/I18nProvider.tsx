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
    <NextIntlClientProvider locale="es" messages={esMessages}>
      {children}
    </NextIntlClientProvider>
  );
}
