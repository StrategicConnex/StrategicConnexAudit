import { db } from "@/shared/db";
import { auditLogs } from "@/shared/db/schemas";
import { headers } from "next/headers";

type LogLevel = 'info' | 'warn' | 'error' | 'security';

interface LogOptions {
  userId?: string;
  projectId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown> | unknown;
  error?: Error | unknown;
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

    console.log(`[${timestamp}] ${icon} [${level.toUpperCase()}] ${options.action}`, {
      projectId: options.projectId,
      userId: options.userId,
      metadata: options.metadata,
      error: errorMessage || options.error
    });

    // 2. Persistencia en Base de Datos para eventos crticos
    if (level === 'security' || level === 'error') {
      try {
        const headerList = await headers();
        const ip = headerList.get("x-forwarded-for") || "unknown";
        const ua = headerList.get("user-agent") || "unknown";

        const errObj = options.error instanceof Error ? options.error : null;

        // Usamos una conexin normal (fuera de withRLS) para asegurar que el log se guarde
        // incluso si la operacin principal fall por RLS.
        await db.insert(auditLogs).values({
          userId: options.userId,
          projectId: options.projectId,
          action: `${level.toUpperCase()}: ${options.action}`,
          entityType: options.entityType,
          entityId: options.entityId,
          newData: {
            metadata: options.metadata as Record<string, unknown>,
            error: errObj ? errObj.message : (typeof options.error === 'string' ? options.error : String(options.error)),
            stack: isProd ? undefined : (errObj ? errObj.stack : undefined)
          },
          ipAddress: ip,
          userAgent: ua
        });
      } catch (logError) {
        console.error("🚨 FALLO CRITICO AL GUARDAR AUDIT LOG:", logError);
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

