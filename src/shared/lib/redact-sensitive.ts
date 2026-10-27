/**
 * Scrubber compartido de datos sensibles.
 *
 * Vive en `shared` para que el contexto server-side (copilot-prompt) y la
 * memoria de chat del cliente apliquen exactamente las mismas reglas antes de
 * que un dato salga del navegador o entre en un prompt.
 */

const SECRET_KEY =
  /(pass(word)?|secret|token|api[_-]?key|authorization|cookie|session|private[_-]?key|credential)/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JWT = /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const PREFIXED_KEY = /\b(?:sk|pk|rk|ghp|gho|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}\b/g;

/** Redacta secretos y PII obvios dentro de un texto libre. */
export function redactSensitiveText(value: string): string {
  return value
    .replace(EMAIL, "[EMAIL]")
    .replace(JWT, "[REDACTED]")
    .replace(PREFIXED_KEY, "[REDACTED]");
}

/**
 * Redacta un contexto estructurado preservando su forma.
 * - Campos cuyo nombre parece credencial → [REDACTED]
 * - Emails → [EMAIL]
 * - JWT / API keys con prefijo conocido → [REDACTED]
 */
export function redactSensitiveContext(value: unknown, key?: string): unknown {
  if (key && SECRET_KEY.test(key)) return "[REDACTED]";
  if (typeof value === "string") return redactSensitiveText(value);
  if (Array.isArray(value)) return value.map((item) => redactSensitiveContext(item));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
        childKey,
        redactSensitiveContext(childValue, childKey),
      ]),
    );
  }
  return value;
}
