"use client";

import { useEffect, useState } from "react";

/**
 * Colores de charts theme-aware.
 *
 * Recharts pasa `stroke`/`fill` como atributos SVG, donde los CSS custom
 * properties (`var(--x)`) no se resuelven de forma fiable. Este hook lee los
 * tokens del tema actual desde `getComputedStyle` y devuelve colores literales,
 * re-leyéndolos cuando `data-theme` cambia en <html>.
 *
 * En SSR (sin `document`) devuelve fallbacks oscuros para evitar crash de
 * hidratación — el primer paint del cliente corrige los valores.
 */
export function useChartColors() {
  const [theme, setTheme] = useState<string>("dark");

  useEffect(() => {
    const el = document.documentElement;
    // Leer tras la transición CSS de tema (0.2s) para no capturar un valor
    // a medio animar — getComputedStyle devuelve el valor interpolado.
    const apply = () => {
      const current = el.getAttribute("data-theme") || "dark";
      window.setTimeout(() => setTheme(current), 250);
    };
    apply();
    const obs = new MutationObserver(apply);
    obs.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      obs.disconnect();
    };
  }, []);

  // Lectura barata (CSS vars) — se recalcula en cada render del hook, que solo
  // ocurre al cambiar de tema (theme es la invalidación intencional).
  if (typeof document === "undefined") {
    return {
      healthy: "#22c55e",
      degraded: "#f59e0b",
      unhealthy: "#ef4444",
      grid: "rgba(255,255,255,0.04)",
      text: "rgba(255,255,255,0.4)",
      models: [
        "#06b6d4", "#22c55e", "#a855f7", "#f59e0b",
        "#ef4444", "#3b82f6", "#ec4899", "#84cc16",
      ],
    };
  }
  void theme;
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  return {
    healthy: v("--chart-success") || "#22c55e",
    degraded: v("--chart-warning") || "#f59e0b",
    unhealthy: v("--chart-danger") || "#ef4444",
    grid: v("--chart-grid") || "rgba(255,255,255,0.04)",
    text: v("--chart-label") || "rgba(255,255,255,0.4)",
    models: [
      v("--chart-primary"),
      v("--chart-success"),
      v("--chart-secondary"),
      v("--chart-warning"),
      v("--chart-danger"),
      v("--accent-blue"),
      v("--accent-purple"),
      v("--accent-cyan"),
    ].filter(Boolean) as string[],
  };
}
