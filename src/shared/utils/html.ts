/**
 * html.ts — Pure helpers for HTML escaping and safe syntax highlighting.
 *
 * Central XSS defense utilities shared by playground, PDF exporters and
 * any other component that must inject HTML built from user/AI input.
 * Kept pure (no DOM) so they can be unit-tested in isolation.
 */

/** Escapes HTML special characters to prevent XSS when interpolating into innerHTML. */
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Applies JSON syntax highlighting to an ALREADY-ESCAPED JSON string.
 *
 * IMPORTANT: the input must be escaped first (e.g. `escapeHtml(text)`) so the
 * regexes only match escaped tokens and the injected `<span>` wrappers are
 * the ONLY raw HTML that reaches the DOM. The captured groups come from
 * escaped text, so they can never re-introduce executable HTML.
 *
 * Single-pass tokenizer: one global regex + one callback decides the span
 * class per token, so the class names we inject (e.g. `text-amber-400`) are
 * never re-scanned by a later replace — that would double-highlight the
 * digits/words inside the markup itself.
 */
export function syntaxHighlightJson(escapedJson: string): string {
  // Entity-aware string token: any char that is not `&`, or an `&` NOT followed
  // by `quot;` — so strings containing escaped entities (`&amp;`, `&lt;`, `&#039;`)
  // are wrapped whole instead of leaking digits/words into number/boolean rules.
  const strChar = "(?:[^&]|&(?!quot;))*";
  const tokenRegex =
    new RegExp(`&quot;(${strChar})&quot;(?=\\s*:)|&quot;(${strChar})&quot;|\\b(true|false)\\b|\\b(null)\\b|\\b(\\d+(?:\\.\\d+)?)\\b`, "g");

  return escapedJson.replace(tokenRegex, (...args) => {
    const [, key, str, bool, nil, num] = args as unknown as [string, string | undefined, string | undefined, string | undefined, string | undefined, string | undefined];
    if (key !== undefined) return `<span class="text-primary">&quot;${key}&quot;</span>`;
    if (str !== undefined) return `<span class="text-chartreuse">&quot;${str}&quot;</span>`;
    if (bool !== undefined) return `<span class="text-amber-400">${bool}</span>`;
    if (nil !== undefined) return `<span class="text-muted-fg/50">${nil}</span>`;
    if (num !== undefined) return `<span class="text-purple-400">${num}</span>`;
    return args[0];
  });
}
