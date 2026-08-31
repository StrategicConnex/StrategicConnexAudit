import { createClient } from "@/shared/lib/supabase/server";
import { z } from "zod";
import { withRLS } from "@/shared/db/rls";
import { directDb } from "@/shared/db";
import { ExtractTablesWithRelations } from 'drizzle-orm';
import { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import { PgTransaction } from 'drizzle-orm/pg-core';
import * as schema from '../db/schemas/index';
import { logger } from "@/shared/lib/logger";
import { User } from "@supabase/supabase-js";

export type ActionState<T> = {
  data?: T;
  error?: string;
  validationErrors?: Record<string, string[]>;
};

// Tipo para la transaccin de Drizzle con esquemas
export type DbTransaction = PgTransaction<NodePgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

/**
 * Wrapper de seguridad para Server Actions.
 * Garantiza autenticacin, validacin de esquema y aplica RLS (Row Level Security) en la DB.
 */

// ── Dev bypass helper ────────────────────────────────────────────────────
// Usa un usuario sintético + directDb (sin RLS) para desarrollo local
async function handleDevBypass<Schema extends z.ZodTypeAny, T>(
  zodSchema: Schema,
  formData: z.infer<Schema> | FormData,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- directDb lazy proxy has complex type
  action: (data: z.infer<Schema>, context: { user: User; tx: any }) => Promise<T>
): Promise<ActionState<T>> {
  try {
    // Parsear datos de entrada
    let rawData: unknown;
    if (formData instanceof FormData) {
      rawData = Object.fromEntries(formData.entries());
    } else {
      rawData = formData;
    }

    const result = zodSchema.safeParse(rawData);
    if (!result.success) {
      return {
        error: "Error de validacin de datos.",
        validationErrors: result.error.flatten().fieldErrors as Record<string, string[]>,
      };
    }

    // Usuario sintético para desarrollo
    const devUser = {
      id: 'dev-bypass-user',
      email: 'dev@localhost.dev',
      user_metadata: { full_name: 'Dev Bypass User' },
      app_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
      role: 'authenticated',
    } as User;

    // Ejecutar usando directDb que bypassea RLS
    const data = await action(result.data, { user: devUser, tx: directDb });

    return { data };
  } catch (error: unknown) {
    const err = error as Error;
    return { error: err instanceof Error ? err.message : "Error inesperado en bypass de desarrollo." };
  }
}

export function authenticatedAction<Schema extends z.ZodTypeAny, T>(
  zodSchema: Schema,
  action: (data: z.infer<Schema>, context: { user: User, tx: DbTransaction }) => Promise<T>
) {
  return async (formData: z.infer<Schema> | FormData): Promise<ActionState<T>> => {
    try {
      // ── Dev bypass: saltar autenticacin real en desarrollo ──────────────
      const DEV_BYPASS = process.env.NODE_ENV === 'development' &&
        process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true';

      if (DEV_BYPASS) {
        return await handleDevBypass(zodSchema, formData, action);
      }

      // 1. Validar Sesin
      const supabase = await createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        await logger.security({
          action: 'UNAUTHORIZED_ACTION_ATTEMPT',
          metadata: { authError: authError ? String(authError) : 'No user in session' }
        });
        return { error: "No autorizado. Debes iniciar sesin para realizar esta accin." };
      }

      // 2. Validar Datos de Entrada
      let rawData: unknown;
      if (formData instanceof FormData) {
        rawData = Object.fromEntries(formData.entries());
      } else {
        rawData = formData;
      }

      const result = zodSchema.safeParse(rawData);

      if (!result.success) {
        return {
          error: "Error de validacin de datos.",
          validationErrors: result.error.flatten().fieldErrors as Record<string, string[]>,
        };
      }

      // 3. Ejecutar Accion dentro de un contexto RLS seguro
      const data = await withRLS(user.id, async (tx) => {
        return await action(result.data, { user, tx });
      });

      // Log de xito (Opcional, pero til para auditora)
      await logger.info({
        userId: user.id,
        action: 'ACTION_SUCCESS',
        metadata: { schema: zodSchema.description || 'anonymous_schema' }
      });

      return { data };
    } catch (error: unknown) {
      const err = error as Error;
      await logger.error({
        action: 'SERVER_ACTION_EXCEPTION',
        error: err,
        metadata: { stack: err?.stack || 'No stack' }
      });
      return { error: err instanceof Error ? err.message : "Ocurri un error inesperado." };
    }
  };
}

