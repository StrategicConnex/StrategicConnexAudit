// Environment variables - validated at runtime, not build time
// Vercel doesn't have env vars during build phase

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
