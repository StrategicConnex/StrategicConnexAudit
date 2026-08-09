# ENGINEERING LOOP — Autonomous Engineering Loop (v3.4)

> **Doctrina de ejecución de cambios de ingeniería.** Complementa [`CORE_SYSTEM.md`](CORE_SYSTEM.md) (doctrina del AI Copilot). Mientras CORE_SYSTEM gobierna *qué es el Copilot*, este documento gobierna *cómo se ejecuta cualquier cambio de ingeniería* con separación estricta de análisis → decisión → plan → autorización → ejecución → verificación.

**Versión:** 3.4 · **Estado:** Doctrina operativa (el repo ya implementa los artefactos — ver §9) · **Revisión:** 2026-08-09

---

## 1. PRINCIPIO FUNDAMENTAL

> **Ningún agente ejecuta una modificación importante directamente después de razonar sobre ella.**

Los agentes pasan de *"analizar y recomendar"* a **observar → razonar → planificar → validar → ejecutar de forma controlada → verificar → aprender**.

## 2. EL LOOP

```text
OBSERVE → UNDERSTAND → ANALYZE → GENERATE OPTIONS → RISK ASSESSMENT
   → PLAN → VALIDATE → APPROVAL → EXECUTE → VERIFY → ROLLBACK IF NEEDED → LEARN
```

Separación obligatoria de responsabilidades:

```text
Analysis → Decision → Execution Plan → Authorization → Execution → Verification
```

Ninguna de estas etapas puede colapsarse en otra sin justificación documentada.

## 3. EJECUCIÓN POR RIESGO

| Riesgo | Ejecución |
|---|---|
| LOW / MEDIUM | AUTO EXECUTE (con verificación y rollback disponible) |
| HIGH | HUMAN APPROVAL obligatoria (paquete de aprobación firmado) |

Ejemplos HIGH en este proyecto: cambios de DB productiva, credenciales, políticas RLS, firewall/seguridad, acciones irreversibles, cambios que rompen contratos.

## 4. AGENT RUNTIME (contrato estándar)

Cada agente declara qué puede hacer, qué permisos tiene y qué requiere aprobación:

```yaml
agent:
  id: security-agent
  version: "3.4"
  capabilities:
    - threat-modeling
    - vulnerability-analysis
  permissions:
    read: [source, configuration, logs]
    write: [security-reports]
    execute: [security-tests]
  risk_level: high
  requires_approval:
    - production_changes
    - credential_changes
```

El Orchestrator decide con esto: qué agente, con qué tools, qué requiere autorización humana. Ver contrato completo en [`agents/contracts.md`](../agents/contracts.md).

## 5. TOOL GOVERNANCE (Tool Registry)

Los agentes **no** reciben acceso ilimitado a herramientas. Cada tool declara riesgo y agentes permitidos:

```yaml
tool:
  id: database.write
  risk: critical
  allowed_agents: [database-agent, devsecops-agent]
  requires_approval: true
  environment:
    allowed: [development, staging]
    denied: [production]
```

## 6. EVIDENCE-FIRST ENGINEERING

Toda decisión importante produce un **decision record** con evidencia, alternativas, confianza y riesgo — nunca una opinión aislada:

```yaml
decision:
  id: DEC-2026-001
  problem: { description: "..." }
  evidence:
    - { source: repository, reference: "..." }
    - { source: test, reference: "..." }
    - { source: telemetry, reference: "..." }
  agents: [architecture-agent, security-agent]
  alternatives: [option_a, option_b, option_c]
  selected_option: { id: option_b }
  confidence: { score: 0.91 }
  risk: { level: medium }
  approval: { required: false }
```

## 7. AGENT DEBATE PROTOCOL

Decisión compleja → debate entre agentes: cada uno puede `PROPOSE / CHALLENGE / SUPPORT / REJECT / REQUEST_EVIDENCE`. El Orchestrator NO decide por mayoría simple, aplica:

```text
Evidence + Risk + Agent Authority + Confidence + Policy = Decision
```

## 8. ROLLBACK ENGINE + MEMORY

- **Ejecución:** `SNAPSHOT → CHANGE → VERIFY → PASS=COMMIT / FAIL=ROLLBACK`. Cada ejecución registra `execution record` (estado previo, cambios, tests, outcome, rollback_available).
- **Memoria:** no almacena respuestas; almacena decisiones, evidencia, resultados y consecuencias (project / decision / evidence / learning).

## 9. MAPEO A ARTEFACTOS EXISTENTES (VERIFICADO)

El repo ya implementa la mayor parte de esta doctrina — el mapeo es:

| Concepto v3.4 | Artefacto existente |
|---|---|
| Approval package (HIGH) | `docs/database/CHANGE-002/003/004-APPROVAL-PACKAGE.md` (firma humana, v1.0 → ✅ APLICADO) |
| Post-execution verification | `docs/database/MAT-505-*.md` (verificación post-push + observación T+24h, health check §78) |
| Risk register / assessment | `docs/risk/RISK-REGISTER.md` (RSK-xx, scores, gates) |
| Traceability / audit | `docs/traceability/TRACEABILITY-MATRIX.md` |
| Evidence (tests/telemetry) | `docs/database/PRODUCTION-CHANGE-VERIFICATION.md`, suite 630 tests, gates quality |
| Rollback / snapshot | PITR confirmado en Supabase + `rollback_available` (CHANGE-002); migraciones reversibles documentadas |
| Decision records (ADR) | `docs/adr/` (vacío — pendiente de poblar, ver §10) |
| Agent contracts | [`agents/contracts.md`](../agents/contracts.md) (nuevo) |
| Copilot doctrine | `docs/CORE_SYSTEM.md` |
| Tool governance | `docs/templates/tool-registry.md` (plantilla, nuevo) |

## 10. BRECHAS v3.4 → v3.5 (self-healing)

| Brecha | Estado |
|---|---|
| `docs/adr/` vacío — los ADRs deben poblarse (provider, routing, cache, RLS por fases) | ⏳ |
| Decision records `DEC-2026-xxx` no se generan aún con el formato estándar | ⏳ |
| Tool Registry no materializado (solo plantilla) | ⏳ |
| Debate protocol sin casos reales registrados | ⏳ |
| v3.5 (self-healing): detect → diagnose → predict → plan → approve → remediate → test → verify → rollback → learn → monitor (loop cerrado) | 🚫 Futuro |

## 11. REGLA DE ORO

Nunca afirmar que una ejecución fue validada sin evidencia ejecutada. Cada reporte cita archivos y números reales (tests pasados, gates, checks).
