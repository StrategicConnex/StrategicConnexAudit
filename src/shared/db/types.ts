import type { projects } from "./schemas";

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
    /** Salud 0-100 derivada de los issues de la última auditoría completada. null = sin datos. */
    healthScore?: number | null;
    /** Issues de esa misma auditoría, para explicar el score. 0 = sin issues. */
    criticalIssues?: number;
    warningIssues?: number;
  } | null;
  integrations?: unknown[] | null;
};
