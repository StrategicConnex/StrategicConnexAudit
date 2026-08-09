"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { THEME_STORAGE_KEY } from "./theme-script";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  /** Preferencia del usuario (system = seguir al SO). */
  theme: ThemePreference;
  /** Tema efectivo aplicado al DOM. */
  resolved: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isValidPref(v: unknown): v is ThemePreference {
  return v === "light" || v === "dark" || v === "system";
}

/* ─── Store de preferencia (localStorage + notificación cross-tab) ───── */

let cached: ThemePreference | null = null;
const prefListeners = new Set<() => void>();

function readStored(): ThemePreference | null {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return isValidPref(v) ? v : null;
  } catch {
    return null;
  }
}

function getPref(): ThemePreference {
  if (typeof window === "undefined") return "system";
  if (!cached) cached = readStored() ?? "system";
  return cached;
}

function subscribePrefs(cb: () => void) {
  prefListeners.add(cb);
  return () => {
    prefListeners.delete(cb);
  };
}

function setPref(p: ThemePreference) {
  cached = p;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, p);
  } catch {
    // storage no disponible (privacy mode) — el tema aplica solo en sesión
  }
  prefListeners.forEach((l) => l());
}

/* ─── Store de prefers-color-scheme (media query) ─────────────────────── */

function subscribeMedia(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function getMedia(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/* ─── Provider ─────────────────────────────────────────────────────────── */

/**
 * Tema System / Light / Dark con persistencia y sin hydration mismatch:
 * `useSyncExternalStore` usa el snapshot de servidor ("system") en el primer
 * render cliente y luego conmuta al valor real — patrón oficial para stores
 * externos (localStorage + media query). El script anti-FOUC (head) ya fijó
 * el tema correcto en el DOM antes del paint; este effect solo sincroniza.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribePrefs, getPref, () => "system" as ThemePreference);
  const system = useSyncExternalStore(subscribeMedia, getMedia, () => "dark" as ResolvedTheme);
  const resolved: ResolvedTheme = theme === "system" ? system : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", resolved);
    root.style.colorScheme = resolved;
  }, [resolved]);

  const setTheme = useCallback((p: ThemePreference) => setPref(p), []);

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme debe usarse dentro de <ThemeProvider>");
  return ctx;
}
