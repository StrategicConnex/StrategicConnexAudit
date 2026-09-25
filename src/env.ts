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
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY, OPENROUTER_API_KEY.
 * - Opcionales: RESEND_API_KEY, SLACK_WEBHOOK_URL, TEAMS_WEBHOOK_URL.
 *
 * Se exporta para que los tests (y futuros puntos de entrada) puedan validar
 * contra el mismo esquema sin repetir la definición.
 */
export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().min(1).optional(),
  SLACK_WEBHOOK_URL: z.string().url().optional(),
  TEAMS_WEBHOOK_URL: z.string().url().optional(),
});

/** Forma tipada que devuelve {@link validateEnv}. */
export type Env = z.infer<typeof envSchema>;

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
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL,
  TEAMS_WEBHOOK_URL: process.env.TEAMS_WEBHOOK_URL,
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
