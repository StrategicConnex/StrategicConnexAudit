---
name: live-backend-verify
description: Verify the running system against REAL backends (Supabase, Trigger.dev crons, OpenRouter pool, PDF rendering, test suites) and report evidence. Use whenever the user asks to "probar todo", "probar con datos reales", "verificar triggers", "verificar el pool de IA", "audit the live system", or before any release/commit that touches DB, triggers, AI routing, or PDF generation — even if they don't say "skill".
---

# Live Backend Verify

End-to-end verification campaign against real backends. Unit tests prove logic with mocks; this proves the system works with real data. Always report a results table with evidence (status codes, counts, latencies) — never claim DONE without it.

## 0. Environment hygiene (why: lessons learned the hard way)

- `.env.local` uses `\$` escaping because Next.js (`@next/env`) expands `$VAR` and eats password chars (proven: 13→9 chars → Supabase 28P01). Plain `dotenv`/node `--env-file` do NOT expand — but they also do NOT unescape, so they see the backslash literally.
- Consequence: scratch scripts that open the DB directly MUST normalize first:
  `process.env.DATABASE_URL.replace(/\\\$/g, '$')` (same for `DIRECT_URL`). The Next dev server needs no normalization.
- If Supabase auth fails with 28P01 only under Next but works in plain node, suspect `$` expansion first: compare password length inside vs outside Next before anything else.
- Never print secret VALUES. Only names, lengths, hashes, booleans.
- Dev servers started for tests MUST be stopped afterwards; orphaned `next-server` processes hold the port and serve stale/broken responses. After every server run, kill leftovers on the port. Prefer the `webapp-testing` skill lifecycle (`with_server.py`) or `Start-Job` + explicit cleanup in the same command.
- Temp scripts go to `scratch/` (eslint-ignored) or the OS temp dir, and are DELETED after the run. Temp vitest files (`zz-*.test.ts`) are deleted too.

## 1. Supabase (read-only first)

1. Table inventory: count rows on key tables (`projects`, `audits`, `uptime_logs`, `security_audit_logs`, `ai_health_logs`, `intelligence_findings`, `monitoring_schedules`, `developer_api_keys`, ...). Investigate any `42P01 undefined_table` — it may be a wrong table name, not drift; confirm against `information_schema` / `src/shared/db/schemas`.
2. RLS spot-check: query `projects`, `security_audit_logs`, `developer_api_keys` via PostgREST with the anon/publishable key (public by design). Expect `401`/`42501` — RLS enforced.
3. Applied migrations: `db:push` doesn't record; verify by column existence (`information_schema`), not by journal.

## 2. Triggers and crons (safe-fire list)

Safe to fire against dev (`pnpm dev --port 3100`, no `CRON_SECRET` needed locally — fail-open in dev only):
- `GET /api/cron/siem` → expect `success:true` (patterns may be `[]`; heartbeat skipped without SIEM webhooks).
- `GET /api/cron/uptime` → expect `success:true` + per-project results (real HEAD checks).
- Session-gated routes (`/api/intelligence/*`, `/api/reports/pdf`, `/api/api-keys`, PDF report routes) → expect `401 "No autorizado"`. That 401 IS the passing assertion (guards hold).

NEVER fire live without explicit user approval: `cleanup-old-logs` (deletes >30d rows), `continuous-discovery`, `adversary-*`, `mitre-*`, `scheduled-scan` (real scans + AI quota burn). For these, run their `.test.ts` unit tests (mocked) and review code instead.

Logic-level live tests (temp vitest, real DB, delete file after):
- `runApiKeyExpiryCheck()` — safe (read-only unless keys expiring).
- `runAllDetections(projectId)` — requires a REAL project id; calling with `undefined` produces a cryptic Postgres syntax error (known footgun, not an app bug — the real trigger always passes ids).
- `detectErrorRateAnomalies` joins via `investigations`/`tool_runs` because `intelligence_run_events` has no `project_id` (fixed 2026-09-16; don't regress).

## 3. AI pool (quota-aware!)

- Free tier ≈ 50 req/day. A full sweep burns ~15-20 calls. Check quota state FIRST via `GET /api/ai/healthcheck` (no auth in dev): uniform `429` = exhausted quota, which itself verifies graceful degradation.
- Pool truth lives in `TASK_ROUTING` (`src/server/ai/ai-router.ts`): `openrouter/free` first in chat chains (never in JSON-critical chains — random routing is unacceptable there), then verified `:free` models only. A model leaves the pool on hard failure (404/timeout ×2), returns after 2 healthy days. Document pool changes with date + evidence in code comments.
- The healthcheck micro-prompt must stay neutral English — imperative non-English prompts trigger empty-200 responses on several providers (false "degraded").
- Verifying the chain end-to-end: temp vitest calling `callAIWithFallback` with a unique marker, assert the marker echoes (proves a real model answered, not cache), then repeat for cache hit. Delete the temp file after.

## 4. PDF reports

- Without a user session, the 3 PDF routes must return 401 (guard assertion).
- Renderer smoke (no session needed): plain node + `@react-pdf/renderer` `renderToBuffer` on a minimal doc, assert `%PDF-` header and unicode text. This proves the stack, not the data path.

## 5. Suites

- `pnpm test` (full vitest, ~2 min) must be green before any commit touching UI strings — UI text changes break text-asserting tests (known cases: `TopologyGraph`, `MonitoringTab` webhook button now matched by `aria-label`, next-intl mocked to echo keys).
- `pnpm test:contract` (static OpenAPI checks, fast).
- E2E Playwright: blocked unless matching browsers are installed AND a test session exists — say so explicitly instead of faking it.

## Report format

Always close with one table per area: check → expected → observed → verdict (pass/fail/blocked + why). Distinguish "failed" (real bug, file:line) from "blocked" (quota/session/browser). Never mark blocked items as passed.
