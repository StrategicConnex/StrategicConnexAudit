/**
 * Script inline anti-FOUC — se inyecta en <head> con el nonce CSP de la
 * request (src/app/layout.tsx) y ejecuta ANTES del primer paint:
 * lee la preferencia persistida (localStorage) o la del sistema y fija
 * `data-theme` + `color-scheme` en <html>, evitando el flash light/dark.
 *
 * Es puramente atributos/CSSOM — no inyecta <style> ni <script>, por lo
 * que no choca con la CSP estricta (script-src 'self' 'nonce-…' 'strict-dynamic').
 */
export const THEME_STORAGE_KEY = "scaudit-theme";

/**
 * Anti-FOUC script. Reads theme from:
 * 1. localStorage (client-side, fast)
 * 2. Cookie (SSR-readable, cross-tab synced)
 * 3. System preference (fallback)
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(!t||t==="system"){var m=document.cookie.match(new RegExp("(?:^|; )${THEME_STORAGE_KEY}=([^;]*)"));t=m?decodeURIComponent(m[1]):"system";}var s=t==="light"||t==="dark"||t==="system"?t:"system";var d=s==="dark"||(s==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var root=document.documentElement;root.setAttribute("data-theme",d?"dark":"light");root.style.colorScheme=d?"dark":"light";}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();`;
