import { createClient } from "@/shared/lib/supabase/server";
import { z } from "zod";
import { withRLS } from "@/shared/db/rls";
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
export function authenticatedAction<Schema extends z.ZodTypeAny, T>(
  zodSchema: Schema,
  action: (data: z.infer<Schema>, context: { user: User, tx: DbTransaction }) => Promise<T>
) {
  return async (formData: z.infer<Schema> | FormData): Promise<ActionState<T>> => {
    try {
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

