# Decision Record — DEC-2026-XXX

> Cada decisión importante produce evidencia, alternativas evaluadas, confianza y riesgo. Nunca una opinión aislada.

```yaml
decision:
  id: DEC-2026-XXX
  date: YYYY-MM-DD

  problem:
    description: "..."

  evidence:
    - source: repository
      reference: "ruta/archivo (línea)"
    - source: test
      reference: "npx vitest run → N passed"
    - source: telemetry
      reference: "metric / log / health check"

  agents:
    - architecture-agent
    - security-agent

  alternatives:
    - id: option_a
      summary: "..."
    - id: option_b
      summary: "..."
    - id: option_c
      summary: "..."

  selected_option:
    id: option_b
    rationale: "..."

  confidence:
    score: 0.00        # 0..1
    reasoning: "..."

  risk:
    level: low | medium | high
    mitigations: ["..."]

  approval:
    required: true | false
    approved_by: "nombre/firma (si aplica)"
    package: "docs/database/CHANGE-XXX-APPROVAL-PACKAGE.md (si aplica)"
```

## Evidencia adicional
<!-- Enlaces a MAT-505, RISK-REGISTER RSK-xx, TRACEABILITY-MATRIX, tests -->
