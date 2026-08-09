# Debate Record — DEB-XXX

> Decisión compleja → debate entre agentes. El Orchestrator decide con **Evidence + Risk + Agent Authority + Confidence + Policy**, nunca por mayoría simple.

```yaml
debate:
  id: DEB-XXX
  proposal: "<decisión en disputa>"
  date: YYYY-MM-DD

  positions:
    architecture:
      position: approve | challenge | support | reject | request_evidence
      confidence: 0.00
      rationale: "..."
    security:
      position: ...
      confidence: 0.00
      concerns:
        - token exposure
        - trust boundary
    database:
      position: ...
      confidence: 0.00
    devsecops:
      position: ...
      confidence: 0.00

  resolution:
    decision: "..."
    basis: "evidence + risk + authority + confidence + policy"
    confidence: 0.00
    risk: low | medium | high
    approval_required: true | false

  dissent:
    recorded: true | false
    outcome: "cómo se manejó la objeción (veto, mitigación, alternativa)"
```

## Reglas
1. `REQUEST_EVIDENCE` bloquea la decisión hasta que se aporte evidencia.
2. `REJECT` de un agente con riesgo high → requiere escalamiento humano (veto_engine).
3. Todo dissent queda registrado para auditoría (TRACEABILITY-MATRIX).
