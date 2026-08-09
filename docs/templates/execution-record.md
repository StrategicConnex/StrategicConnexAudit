# Execution Record — EXEC-XXX

> Registro de ejecución con snapshot, verificación y rollback. Requisito para autonomía real.

```yaml
execution:
  id: EXEC-XXX
  plan: PLAN-XXX            # o CHANGE-XXX
  date: YYYY-MM-DD
  executor: <agent-id>

  before_state:
    hash: "git rev-parse HEAD"
    db_schema: "journal idx N · drizzle-kit check OK"

  changes:
    - file: "ruta/archivo"
      type: modify | create | delete
      summary: "..."

  verification:
    type: unit | integration | sql | preview
    command: "..."
    tests: N
    passed: N
    failed: 0

  outcome: success | failed | rolled_back

  rollback_available: true | false
  rollback_strategy: "PITR / revert commit / migración inversa / restore snapshot"

  evidence:
    - "docs/database/MAT-505-*.md"
    - "RISK-REGISTER RSK-xx"
```

## Post-verificación (observación)
- T+24h: health check §78 · aislamiento realtime · pg_policies / pg_publication_tables
