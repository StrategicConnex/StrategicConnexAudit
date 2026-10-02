/**
 * app-logs-sink — captura de errores hacia la tabla `app_logs` (ADR-007).
 *
 * Se instala desde `src/instrumentation.ts` (sólo runtime nodejs, sólo
 * producción, nunca en fase de build):
 *
 * - `installErrorSink()` envuelve `console.error` preservando la salida
 *   original hacia `vercel logs` (paridad con los rechecks históricos).
 * - `captureRequestError()` persiste los errores no capturados que Next
 *   convierte en 500 (hook `onRequestError`).
 *
 * Invariante: el sink nunca lanza ni bloquea (fail-open, como ADR-002) y
 * admite como máximo 60 inserciones/min por instancia para que un storm de
 * errores no inunde la base de datos.
 */

import "server-only";

import { directDb } from "@/shared/db";
import { appLogs } from "@/shared/db/schemas";

const MAX_MESSAGE_CHARS = 2000;
const MAX_CONTEXT_CHARS = 4000;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;

export interface AppErrorEntry {
  message: string;
  source: "console" | "request-error";
  code?: string;
  path?: string;
  context?: Record<string, unknown>;
}

let windowStart = 0;
let windowCount = 0;
let installed = false;

function sinkEnabled(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  );
}

function allowByQuota(): boolean {
  const now = Date.now();
  if (now - windowStart >= WINDOW_MS) {
    windowStart = now;
    windowCount = 0;
  }
  if (windowCount >= MAX_PER_WINDOW) return false;
  windowCount += 1;
  return true;
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) + "…" : value;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

function extractCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" || typeof code === "number" ? String(code) : undefined;
}

function stringifyArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return arg.stack || arg.message || String(arg);
  try {
    return JSON.stringify(arg) ?? String(arg);
  } catch {
    return String(arg);
  }
}

function normalizeContext(context: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!context || Object.keys(context).length === 0) return {};
  let serialized: string;
  try {
    serialized = JSON.stringify(context) ?? "";
  } catch {
    return { unserializable: true };
  }
  if (serialized.length > MAX_CONTEXT_CHARS) return { truncated: true, preview: truncate(serialized, MAX_CONTEXT_CHARS) };
  return context;
}

function parseLoggerLine(args: unknown[]): {
  message: string;
  code?: string;
  context?: Record<string, unknown>;
} | null {
  if (args.length !== 1 || typeof args[0] !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(args[0]);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as { level?: unknown; message?: unknown; context?: unknown };
  if (record.level !== "error" || typeof record.message !== "string") return null;
  const context =
    record.context && typeof record.context === "object" && !Array.isArray(record.context)
      ? (record.context as Record<string, unknown>)
      : undefined;
  const rawCode = context?.["code"];
  const code =
    typeof rawCode === "string"
      ? rawCode
      : record.message.includes("42501")
        ? "42501"
        : undefined;
  return { message: record.message, code, context };
}

/**
 * Persiste un error en `app_logs`. Nunca lanza: cualquier fallo interno del
 * sink se descarta (fail-open) para no afectar al request que lo originó.
 */
export async function captureAppError(entry: AppErrorEntry): Promise<void> {
  if (!sinkEnabled()) return;
  if (!entry.message || !allowByQuota()) return;
  try {
    await directDb.insert(appLogs).values({
      level: "error",
      message: truncate(entry.message, MAX_MESSAGE_CHARS),
      code: entry.code,
      source: entry.source,
      path: entry.path,
      context: normalizeContext(entry.context),
    });
  } catch {
    // Fail-open: un fallo del sink jamás debe propagarse al caller.
  }
}

/**
 * Envuelve `console.error` una sola vez por proceso: la salida original se
 * mantiene intacta (vercel logs conserva su flujo) y cada llamada se replica
 * de forma asíncrona hacia `app_logs`. Instalación idempotente.
 */
export function installErrorSink(): void {
  if (installed) return;
  installed = true;
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    original(...args);
    const parsed = parseLoggerLine(args);
    void captureAppError({
      message: parsed ? parsed.message : args.map(stringifyArg).join(" "),
      source: "console",
      code: parsed?.code,
      context: parsed?.context,
    });
  };
}

/**
 * Hook `onRequestError` de Next.js: errores no capturados que Next convierte
 * en respuestas 500. Registra mensaje, código (ej. 42501), ruta y digest.
 */
export async function captureRequestError(
  error: unknown,
  request?: { path?: string; method?: string },
  context?: unknown,
): Promise<void> {
  const err = error as { digest?: unknown } | null;
  const message = errorMessage(error);
  const code = extractCode(error) ?? (message.includes("42501") ? "42501" : undefined);
  const ctx: Record<string, unknown> = {};
  if (typeof err?.digest === "string") ctx["digest"] = err.digest;
  if (request?.method) ctx["method"] = request.method;
  if (context && typeof context === "object" && !Array.isArray(context)) {
    ctx["route"] = context;
  }
  await captureAppError({ message, source: "request-error", code, path: request?.path, context: ctx });
}
