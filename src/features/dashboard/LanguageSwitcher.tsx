"use client";

import { useLocale } from "next-intl";
import { setCookie } from "@/shared/lib/cookie-utils";
import { Globe, Loader2 } from "lucide-react";
import { useState } from "react";

const LOCALE_MAP: Record<string, { label: string; flag: string; switchTo: string }> = {
  es: { label: "Español", flag: "ES", switchTo: "English" },
  en: { label: "English", flag: "EN", switchTo: "Español" },
};

/**
 * Language switcher button.
 * Sets a "NEXT_LOCALE" cookie and refreshes the page so the server
 * picks up the new locale.
 */
export function LanguageSwitcher({ mini = false }: { mini?: boolean }) {
  const locale = useLocale();
  const [isPending, setPending] = useState(false);

  const nextLocale = locale === "es" ? "en" : "es";
  const nextInfo = LOCALE_MAP[nextLocale]!;

  const handleSwitch = () => {
    setPending(true);
    setCookie("NEXT_LOCALE", nextLocale, 365);
    window.location.reload();
  };

  if (mini) {
    return (
      <button
        onClick={handleSwitch}
        disabled={isPending}
        className="flex items-center gap-1.5 text-[11px] font-medium text-muted-fg/60 hover:text-foreground transition-[color,opacity] cursor-pointer disabled:opacity-50"
        title="Switch language"
      >
        {isPending ? (
          <Loader2 size={12} className="animate-spin shrink-0" />
        ) : (
          <Globe size={12} className="shrink-0" />
        )}
        <span>{nextInfo.switchTo}</span>
      </button>
    );
  }

  return (
    <button
      onClick={handleSwitch}
      disabled={isPending}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium
                 text-muted-fg border border-border/50
                 hover:text-foreground hover:border-primary/20 hover:bg-primary/5
                 transition-[color,background-color,border-color,opacity] duration-300 cursor-pointer disabled:opacity-50"
    >
      {isPending ? (
        <Loader2 size={14} className="animate-spin shrink-0" />
      ) : (
        <Globe size={14} className="shrink-0" />
      )}
      <span className="font-bold uppercase tracking-wider text-[10px]">{nextInfo.flag}</span>
      <span>{nextInfo.switchTo}</span>
    </button>
  );
}
