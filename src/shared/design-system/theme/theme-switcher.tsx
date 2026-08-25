"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemePreference } from "./theme-provider";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
  { value: "light", label: "Claro", icon: <Sun size={13} strokeWidth={2.25} /> },
  { value: "dark", label: "Oscuro", icon: <Moon size={13} strokeWidth={2.25} /> },
  { value: "system", label: "Sistema", icon: <Monitor size={13} strokeWidth={2.25} /> },
];

/**
 * Selector de tema — System / Light / Dark.
 * Accesible: role="group" + aria-pressed por botón; estados visibles
 * (fondo + color + texto) y no solo por color.
 */
export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="group"
      aria-label="Tema de la interfaz"
      className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/20 p-0.5"
    >
      {OPTIONS.map(({ value, label, icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-pressed={active}
            aria-label={`Tema ${label}`}
            title={`Tema ${label}`}
            className={cn(
              "flex items-center gap-1.5 rounded-md py-1 text-2xs font-bold uppercase tracking-wider transition-colors cursor-pointer",
              compact ? "px-1.5" : "px-2",
              active
                ? "bg-primary/15 text-primary"
                : "text-muted-fg hover:text-foreground hover:bg-muted/30",
            )}
          >
            {icon}
            {!compact && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
