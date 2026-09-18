/**
 * Structured Logger for StrategicAudit Pro
 *
 * Replaces console.log/warn/error with structured JSON logging.
 * Compatible with Vercel Logs, Datadog, and other log aggregators.
 *
 * Supports request ID correlation via AsyncLocalStorage.
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("Project created", { projectId, userId });
 *   logger.error("Failed to save", { error, context: "audit-save" });
 */

import { AsyncLocalStorage } from "node:async_hooks";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

/** AsyncLocalStorage for request-scoped context (requestId, userId, etc.). */
export const requestContext = new AsyncLocalStorage<{ requestId?: string; userId?: string }>();

function formatTimestamp(): string {
  return new Date().toISOString();
}

function log(level: LogLevel, message: string, context?: LogContext | unknown): void {
  // Normalize unknown context to LogContext
  const normalizedContext: LogContext | undefined =
    context && typeof context === "object" && !Array.isArray(context)
      ? context as LogContext
      : context !== undefined && context !== null
        ? { value: context }
        : undefined;

  // Merge with request-scoped context (requestId, userId)
  const store = requestContext.getStore();
  const scopedContext = store
    ? { ...store, ...normalizedContext }
    : normalizedContext;

  const entry = {
    timestamp: formatTimestamp(),
    level,
    message,
    ...(scopedContext && Object.keys(scopedContext).length > 0 ? { context: scopedContext } : {}),
  };

  const formatted = JSON.stringify(entry);

  switch (level) {
    case "error":
      console.error(formatted);
      break;
    case "warn":
      console.warn(formatted);
      break;
    case "debug":
      if (process.env.NODE_ENV === "development") {
        console.log(formatted);
      }
      break;
    default:
      console.log(formatted);
  }
}

export const logger = {
  debug: (message: string, context?: LogContext | unknown) => log("debug", message, context),
  info: (message: string, context?: LogContext | unknown) => log("info", message, context),
  warn: (message: string, context?: LogContext | unknown) => log("warn", message, context),
  error: (message: string, context?: LogContext | unknown) => log("error", message, context),
};

/**
 * Create a child logger with a fixed context (e.g., module name).
 *
 * Usage:
 *   const log = logger.child({ module: "audit" });
 *   log.info("Starting audit", { auditId });
 */
export function createChildLogger(defaultContext: LogContext) {
  return {
    debug: (message: string, context?: LogContext) =>
      log("debug", message, { ...defaultContext, ...context }),
    info: (message: string, context?: LogContext) =>
      log("info", message, { ...defaultContext, ...context }),
    warn: (message: string, context?: LogContext) =>
      log("warn", message, { ...defaultContext, ...context }),
    error: (message: string, context?: LogContext) =>
      log("error", message, { ...defaultContext, ...context }),
  };
}
