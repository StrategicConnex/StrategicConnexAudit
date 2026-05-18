import { db } from './index';
import { sql } from 'drizzle-orm';
import { ExtractTablesWithRelations } from 'drizzle-orm';
import { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import { PgTransaction } from 'drizzle-orm/pg-core';
import * as schema from './schemas';
import { logger } from '@/shared/lib/logger';

/**
 * Ejecuta una funcin dentro de una transaccin de Postgres estableciendo el contexto de usuario
 * para que las polticas RLS de Supabase funcionen correctamente con Drizzle.
 */
export async function withRLS<T>(
  userId: string,
  callback: (tx: PgTransaction<NodePgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>) => Promise<T>
): Promise<T> {
  try {
    return await db.transaction(async (tx) => {
      // Establecemos el claim 'sub' (User ID) en la sesin actual de Postgres.
      const claims = JSON.stringify({ sub: userId, role: 'authenticated' });
      await tx.execute(sql`SELECT set_config('request.jwt.claims', ${claims}, true)`);
      await tx.execute(sql`SET ROLE authenticated`);
      
      return await callback(tx);
    });
  } catch (error: unknown) {
    // Si el error es 42501 (Insufficient Privilege), es una violacin de RLS detectada por Postgres
    const dbError = error as { code?: string; detail?: string; hint?: string; message?: string };
    if (dbError.code === '42501') {
      await logger.security({
        userId,
        action: 'RLS_VIOLATION_DETECTED',
        error: error,
        metadata: {
          code: dbError.code,
          detail: dbError.detail,
          hint: dbError.hint
        }
      });
    } else {
      await logger.error({
        userId,
        action: 'DATABASE_TRANSACTION_FAILED',
        error: error
      });
    }
    throw error;
  }
}
