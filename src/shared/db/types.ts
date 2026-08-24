import type { projects } from './schemas';

/**
 * Tipos canónicos derivados del schema Drizzle, seguros para importar desde
 * Client Components (type-only: no arrastra drizzle-orm al bundle del cliente).
 *
 * Patrón recomendado: `import type { ProjectRow } from '@/shared/db/types'`
 * en lugar de importar la tabla como valor solo para `typeof x.$inferSelect`.
 */
export type ProjectRow = typeof projects.$inferSelect;

/** Proyecto con los datos anidados que hidrata el dashboard (server page). */
export type ProjectWithNested = ProjectRow & {
  latestAudit?: {
    id: string;
    status: string;
  } | null;
  integrations?: unknown[] | null;
};
