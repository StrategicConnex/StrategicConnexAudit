import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().optional(),
  SLACK_WEBHOOK_URL: z.string().url().optional(),
  TEAMS_WEBHOOK_URL: z.string().url().optional(),
});

function getEnv() {
  // Skip validation during build time (Vercel doesn't have env vars then)
  if (process.env.NEXT_PHASE === "phase-production-build" || process.env.CI) {
    return process.env as z.infer<typeof envSchema>;
  }
  return envSchema.parse(process.env);
}

export const env = new Proxy({} as z.infer<typeof envSchema>, {
  get(_, prop) {
    return getEnv()[prop as keyof z.infer<typeof envSchema>];
  },
});
