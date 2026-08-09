# Agent Contract — <agent-id>

> Contrato estándar de runtime. El Orchestrator usa esto para decidir qué agente, con qué tools, y qué requiere aprobación humana.

```yaml
agent:
  id: <agent-id>            # p.ej. security-agent
  version: "3.4"

  capabilities:
    - <capability-1>        # p.ej. threat-modeling
    - <capability-2>

  permissions:
    read:
      - source
      - configuration
    write:
      - <artefactos-que-puede-escribir>
    execute:
      - <tests/scripts-permitidos>

  risk_level: low | medium | high

  requires_approval:
    - production_changes
    - credential_changes
    - <acciones-que-siempre-requieren-humano>
```

## Documento de doctrina
- Cerebro: `docs/CORE_SYSTEM.md` (copilot) / `docs/ENGINEERING-LOOP.md` (cambios de ingeniería)
- Definición del agente: `agents/<id>.md`

## Verificación de cumplimiento
- [ ] El agente solo ejecuta lo que `permissions.execute` permite
- [ ] `requires_approval` se respeta en HIGH risk
- [ ] Evidencia citada en todo reporte (nunca resultados inventados)
