// Environment variables - validated at runtime, not build time
// Vercel doesn't have env vars during build phase
//
// IMPORTANTE: importar este módulo NUNCA debe lanzar un error. `pnpm build`
// corre en CI/Vercel donde los secrets aún no existen, por eso la validación
// estricta es opt-in mediante validateEnv() (ver JSDoc).

import { z } from "zod";

/**
 * Esquema Zod de las variables de entorno.
 *
 * - Requeridas: DATABASE_URL, DIRECT_URL, NEXT_PUBLIC_SUPABASE_URL,
 *   OPENROUTER_API_KEY y **al menos una** clave Supabase:
 *   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (canónica, CS-301) o su alias
 *   legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
 * - Opcionales: RESEND_API_KEY, SLACK_WEBHOOK_URL, TEAMS_WEBHOOK_URL.
 *
 * El runtime lee la clave con el mismo fallback (`PUBLISHABLE || ANON`) en
 * `src/shared/config/env.ts`; aquí solo se garantiza que exista una de las dos
 * para que el fail-fast de `instrumentation.ts` no aborte un despliegue que
 * usa exclusivamente la canónica.
 *
 * Se exporta para que los tests (y futuros puntos de entrada) puedan validar
 * contra el mismo esquema sin repetir la definición.
 */
export const envSchema = z
  .object({
    DATABASE_URL: z.string().url(),
    DIRECT_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
    OPENROUTER_API_KEY: z.string().min(1),
    // Failover anti-monodependencia (2026-10-19): opcionales — el router
    // salta al proveedor siguiente si la clave no está configurada.
    GROQ_API_KEY: z.string().min(1).optional(),
    GEMINI_API_KEY: z.string().min(1).optional(),
    RESEND_API_KEY: z.string().min(1).optional(),
    SLACK_WEBHOOK_URL: z.string().url().optional(),
    TEAMS_WEBHOOK_URL: z.string().url().optional(),
    // Self-RUM (H-09): id del proyecto dedicado a las métricas CWV propias.
    // Sin valor el beacon NO se renderiza (layout.tsx), fail-closed.
    NEXT_PUBLIC_RUM_PROJECT_ID: z.string().uuid().optional(),
    NEXT_PUBLIC_RUM_BEACON_TOKEN: z.string().max(128).optional(),
  })
  .refine(
    (parsed) =>
      Boolean(parsed.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    {
      message:
        "Se requiere NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (canónica) o su alias NEXT_PUBLIC_SUPABASE_ANON_KEY",
      path: ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
    },
  );

/** Forma tipada que devuelve {@link validateEnv}. */
export type Env = z.infer<typeof envSchema>;

/**
 * Claves cuyo fallo de formato NO aborta el arranque del servidor (incidente
 * 2026-10-19 23:00): son opcionales por diseño y sus consumidores ya son
 * fail-closed (el router AI salta al siguiente proveedor; el layout de RUM
 * no renderiza el beacon). Una env de RUM mal copy-pasteada no puede tumbar
 * toda la producción.
 */
export const SOFT_ENV_KEYS = [
  "GROQ_API_KEY",
  "GEMINI_API_KEY",
  "RESEND_API_KEY",
  "SLACK_WEBHOOK_URL",
  "TEAMS_WEBHOOK_URL",
  "NEXT_PUBLIC_RUM_PROJECT_ID",
  "NEXT_PUBLIC_RUM_BEACON_TOKEN",
] as const;

/**
 * Lectura directa (sin validación) de las variables de entorno.
 *
 * Existe para compatibilidad con el código que ya importa `env`; los valores
 * pueden ser `undefined` si la variable no está seteada. La validación
 * garantizada está en {@link validateEnv}.
 */
export const env = {
  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_URL: process.env.DIRECT_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL,
  TEAMS_WEBHOOK_URL: process.env.TEAMS_WEBHOOK_URL,
  NEXT_PUBLIC_RUM_PROJECT_ID: process.env.NEXT_PUBLIC_RUM_PROJECT_ID,
  NEXT_PUBLIC_RUM_BEACON_TOKEN: process.env.NEXT_PUBLIC_RUM_BEACON_TOKEN,
} as const;

/**
 * Valida `process.env` contra {@link envSchema} y devuelve el objeto parseado.
 *
 * **CUÁNDO llamarla:** solo en runtime de servidor, desde puntos de entrada
 * que se ejecutan después del build (p. ej. route handlers, `instrumentation.ts`,
 * tareas de Trigger.dev), idealmente detrás de un `import "server-only"`.
 *
 * ```ts
 * import "server-only";
 * import { validateEnv } from "@/env";
 *
 * const env = validateEnv(); // lanza ZodError descriptivo si falta algo
 * ```
 *
 * **CUÁNDO NO llamarla:** nunca en el top-level de un módulo ni en nada que
 * se ejecute durante `next build` (import-time). En CI/Vercel las variables
 * no existen en fase de build y lanzaría un ZodError que rompe el build.
 *
 * @returns El objeto parseado con las variables validadas y tipadas.
 * @throws {z.ZodError} Si falta una requerida o alguna tiene formato inválido.
 */
export function validateEnv(): Env {
  return envSchema.parse(process.env);
}

/**
 * Validación con **degradación suave** de las variables de {@link SOFT_ENV_KEYS}.
 *
 * Comportamiento:
 * 1. Parse completo exitoso → `{ env, soft: [] }`.
 * 2. Falla SOLO en claves opcionales → se eliminan las claves ofensoras del
 *    entorno parseado, se reparsea y se reportan como degradadas. El
 *    arranque continúa (los consumidores de esas claves ya son fail-closed).
 * 3. Falta algo REQUERIDO (o la refine del par de claves Supabase) → lanza
 *    el ZodError original: fail-fast igual que antes.
 *
 * @throws {z.ZodError} Si falla algo no-listado en {@link SOFT_ENV_KEYS}.
 */
export function validateEnvSoft(): { env: Env; soft: string[] } {
  const first = envSchema.safeParse(process.env);
  if (first.success) return { env: first.data, soft: [] };

  const softSet = new Set<string>(SOFT_ENV_KEYS);
  const offending = new Set(
    first.error.issues
      .map((issue) => String(issue.path[0] ?? ""))
      .filter((key) => key && softSet.has(key)),
  );
  // Todo lo ofensor es opcional → degradar; si hay ALGO fuera de la lista,
  // es un fallo duro (requeridas ausentes/inválidas, refine Supabase, etc.).
  if (offending.size === 0) throw first.error;

  const cleaned: Record<string, string | undefined> = { ...process.env };
  for (const key of offending) delete cleaned[key];

  const retry = envSchema.safeParse(cleaned);
  if (!retry.success) throw retry.error;

  return { env: retry.data, soft: [...offending] };
}
