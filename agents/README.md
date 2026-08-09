# Agents — StrategicAudit Pro AI Copilot

Paquete de agentes/skills especializados que operan bajo el cerebro común [`docs/CORE_SYSTEM.md`](../docs/CORE_SYSTEM.md) y la doctrina de ejecución [`docs/ENGINEERING-LOOP.md`](../docs/ENGINEERING-LOOP.md) (v3.4).

**Regla de jerarquía:** `CORE_SYSTEM.md` (doctrina del copilot) + `ENGINEERING-LOOP.md` (ejecución) → `agents/*.md` (especialización) → `agents/contracts.md` (runtime) → `.agents/skills/*` (técnicas instaladas). Un agente nunca contradice el núcleo.

**Contratos de runtime (v3.4):** ver [`contracts.md`](contracts.md) — capabilities, permissions, risk_level y requires_approval de cada agente.

## Índice

| Agente | Dominio | Contrato principal |
|---|---|---|
| [`architecture.md`](architecture.md) | Arquitectura, capas, boundaries, ADRs | Diseño → impacto → ADR |
| [`frontend.md`](frontend.md) | React/Next, hooks, componentes, estado | UI ↔ useAiChat ↔ API |
| [`security.md`](security.md) | Zero trust, DLP, injection, authz | Prompt → Guard → respuesta |
| [`database.md`](database.md) | Persistencia, RLS, migraciones, cache | Entidad → esquema → RLS |
| [`ux.md`](ux.md) | Copilot UX, a11y, theme, microinteracciones | Mensaje → telemetría → acción |
| [`testing.md`](testing.md) | Unit/integration/E2E, AI eval | Cambio → test → cobertura |
| [`devsecops.md`](devsecops.md) | Pipeline, env, feature flags, deploy | Código → gates → deploy |
| [`documentation.md`](documentation.md) | Docs, contratos, changelog | Cambio → doc → trazabilidad |

## Formato de trabajo

Todo agente reporta según `CORE_SYSTEM.md` §11: **ANALYSIS · IMPACT · PLAN · SECURITY · IMPLEMENTATION · VALIDATION · RESULT · NEXT**.
