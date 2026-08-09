# Agent Runtime Contracts (v3.4)

> Contratos estándar de runtime para los agentes de `agents/`. El Orchestrator decide con esto qué agente, con qué tools y qué requiere aprobación humana. Esquema: `docs/templates/agent-contract.md`. Doctrina: `docs/ENGINEERING-LOOP.md`.

## Tabla de contratos

| Agente | risk_level | permissions.write | permissions.execute | requires_approval |
|---|---|---|---|---|
| `architecture` | medium | ADRs, planes, ANALYSIS | `tsc --noEmit` (análisis) | decisiones de arquitectura high |
| `frontend` | low | componentes, hooks, tests UI | `tsc`, `eslint`, `vitest` (UI) | nada (solo review si toca contratos) |
| `security` | **high** | security reports, hallazgos | security tests, scanners | **production_changes, credential_changes, firewall_changes** |
| `database` | **high** | migraciones, esquemas, policies RLS | `drizzle-kit check/push` (dry-run), SQL verificación | **toda escritura en producción (CHANGE-xxx + firma)** |
| `ux` | low | componentes UI, docs de tema | preview light/dark, a11y checks | nada |
| `testing` | low | tests, reportes de cobertura | `vitest`, test de seguridad | nada |
| `devsecops` | **high** | pipeline, env, feature flags | CI, guards, builds | **deploys, cambios de env/secrets** |
| `documentation` | low | docs, ADRs, changelog | grep de coherencia, quality gates | nada |

## Formato YAML (referencia)

```yaml
agent:
  id: security-agent
  version: "3.4"
  capabilities: [threat-modeling, vulnerability-analysis, dependency-analysis, security-review]
  permissions:
    read: [source, configuration, logs]
    write: [security-reports]
    execute: [security-tests]
  risk_level: high
  requires_approval: [production_changes, credential_changes, firewall_changes]
```

## Reglas de ejecución
1. `risk_level: high` → el agente NUNCA ejecuta su change en producción sin paquete de aprobación firmado (patrón `docs/database/CHANGE-XXX-APPROVAL-PACKAGE.md`).
2. Toda ejecución registra `execution record` (`docs/templates/execution-record.md`) con snapshot + verificación + rollback.
3. Decisión compleja → debate protocol (`docs/templates/debate-record.md`).
4. Toda decisión importante → decision record con evidencia (`docs/templates/decision-record.md`).
