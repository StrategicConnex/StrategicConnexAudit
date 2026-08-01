import { cookies } from "next/headers";
import { routing } from "./routing";

export const locales = ["es", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "es";

export const localeLabels: Record<Locale, string> = {
  es: "Español",
  en: "English",
};

export async function getLocale(): Promise<Locale> {
  let locale: Locale = defaultLocale;

  try {
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
    const accepted = cookieStore.get("accept-language")?.value;

    if (cookieLocale && routing.locales.includes(cookieLocale as Locale)) {
      locale = cookieLocale as Locale;
    } else if (accepted) {
      const preferred = accepted
        .split(",")
        .map((l) => l.split(";")[0].trim().split("-")[0].toLowerCase())
        .find((l) => routing.locales.includes(l as Locale));
      if (preferred) locale = preferred as Locale;
    }
  } catch {
    // Cookie store may not be available in static generation
  }

  return locale;
}

export async function getMessages(locale: Locale) {
  try {
    return (await import(`../../messages/${locale}.json`)).default;
  } catch {
    return (await import(`../../messages/${defaultLocale}.json`)).default;
  }
}
