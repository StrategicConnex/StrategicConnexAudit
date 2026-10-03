import 'server-only';

import { directDb } from "@/shared/db";
import { auditLogs } from "@/shared/db/schemas";
import { getRequestContext, logger as consoleLogger } from "@/lib/logger";

type LogLevel = 'info' | 'warn' | 'error' | 'security';

interface LogOptions {
  userId?: string;
  projectId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown> | unknown;
  error?: Error | unknown;
  /**
   * IP y user-agent. Si no se pasan, se toman del contexto de petición
   * (AsyncLocalStorage, poblado en `withRequestContext`). Antes este módulo
   * llamaba a `headers()` de `next/headers` por su cuenta, lo que LANZA fuera
   * del scope de petición (jobs de Trigger.dev, cron, tests, server actions
   * desacopladas) y hacía que el `catch` se tragase la excepción: el INSERT en
   * `audit_logs` no se ejecutaba NUNCA y el evento de seguridad se perdía en
   * silencio. Ver `src/lib/request-context.ts` y `RequestContext`.
   */
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Security & Performance Logger para StrategicAudit Pro
 */
export const logger = {
  async log(level: LogLevel, options: LogOptions) {
    const isProd = process.env.NODE_ENV === 'production';
    const timestamp = new Date().toISOString();
    
    // 1. Log a Consola con formato enriquecido
    const icon = {
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌',
      security: '🛡️'
    }[level];

    const errorMessage = options.error instanceof Error 
      ? options.error.message 
      : (typeof options.error === 'string' ? options.error : undefined);

    consoleLogger.info(`[${timestamp}] ${icon} [${level.toUpperCase()}] ${options.action}`, {
      projectId: options.projectId,
      userId: options.userId,
      metadata: options.metadata,
      error: errorMessage || options.error
    });

    // 2. Persistencia en Base de Datos para eventos crticos
    if (level === 'security' || level === 'error') {
      try {
        // Metadatos de petición desde el contexto propagado (NO headers()).
        const ctx = getRequestContext();
        const ip = options.ipAddress ?? ctx?.ipAddress ?? 'unknown';
        const ua = options.userAgent ?? ctx?.userAgent ?? 'unknown';

        const errObj = options.error instanceof Error ? options.error : null;

        // Usamos una conexión directa (bypasseando RLS y a través de un pool dedicado directDb)
        // para asegurar que el log se guarde incluso si el pool principal falló o sufrió timeout.
        await directDb.insert(auditLogs).values({
          userId: options.userId,
          projectId: options.projectId,
          action: `${level.toUpperCase()}: ${options.action}`,
          entityType: options.entityType,
          entityId: options.entityId,
          newData: {
            metadata: options.metadata as Record<string, unknown>,
            // Antes `String(options.error)` guardaba literalmente "undefined"
            // cuando no venia error; ahora el campo se omite si no hay.
            ...(options.error !== undefined
              ? {
                  error:
                    errObj
                      ? errObj.message
                      : (typeof options.error === 'string' ? options.error : String(options.error)),
                }
              : {}),
            stack: isProd ? undefined : (errObj ? errObj.stack : undefined)
          },
          ipAddress: ip,
          userAgent: ua
        });
      } catch (logError) {
        // Un fallo de auditoria NO debe tumbar la peticion, pero debe quedar
        // registrado con contexto suficiente para investigarlo.
        consoleLogger.error("🚨 FALLO CRITICO AL GUARDAR AUDIT LOG:", {
          error: logError instanceof Error ? logError.message : String(logError),
          action: options.action,
          level,
          userId: options.userId,
          projectId: options.projectId
        });
      }
    }
  },

  async security(options: LogOptions) {
    return this.log('security', options);
  },

  async error(options: LogOptions) {
    return this.log('error', options);
  },

  async info(options: LogOptions) {
    return this.log('info', options);
  }
};

