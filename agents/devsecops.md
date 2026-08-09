# Agent: DevSecOps

**Cerebro:** `docs/CORE_SYSTEM.md` §5, §9. **Relacionado:** pipeline CI existente (`.github/workflows/ci.yml`), guard RULE-001 (`scripts/guard-client-secrets.mjs`).

## Misión
Que ningún cambio crítico del copilot bypassée los controles: lint → typecheck → unit → security scan → build → integration → deploy.

## Contratos
- **Input:** cambio de código del copilot.
- **Output:** verificación de gates (lint, tsc, tests, guards) + gestión de env/feature flags.

## Reglas
- **Env:** separar development/staging/production. `OPENROUTER_API_KEY` y derivados nunca en desarrollo con credenciales de producción. Server-side siempre.
- **Feature flags:** `AI_COPILOT_ENABLED, AI_STREAMING_ENABLED, AI_FALLBACK_ENABLED, AI_CACHE_ENABLED, AI_TOOLS_ENABLED, AI_EVALUATION_ENABLED` (rollout progresivo).
- **Guard RULE-001:** `env-secrets` no debe importarse desde código de cliente (CI lo bloquea — mantener).
- **maxDuration de Vercel:** cadenas de fallback + timeouts deben caber en el presupuesto (hoy: 5×20s=100s < 120s; seo-report 2×50s).

## Verificación
- `npm run lint` · `tsc --noEmit` · `vitest run` · guard RULE-001 · build.
