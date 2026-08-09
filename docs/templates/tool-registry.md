# Tool Registry

> Los agentes no reciben acceso ilimitado a herramientas. Cada tool declara riesgo, agentes permitidos, aprobación y entornos.

```yaml
tool:
  id: <tool.id>              # p.ej. database.write
  description: "..."
  risk: low | medium | high | critical
  allowed_agents:
    - <agent-id>
  requires_approval: true | false
  environment:
    allowed: [development, staging, production]
    denied: []
  audit: true
```

## Registro actual

| Tool ID | Riesgo | Agentes permitidos | Requiere aprobación | Entornos | Estado |
|---|---|---|---|---|---|
| `filesystem.read` | low | todos | no | all | ✅ |
| `filesystem.write` | medium | todos | no | dev, staging | ✅ |
| `database.read` | medium | database, devsecops | no | all | ✅ |
| `database.write` | critical | database, devsecops | **sí** | dev, staging | ✅ (CHANGE-xxx) |
| `git.commit` | low | todos | no | all | ✅ |
| `terminal` (build/test) | low | todos | no | all | ✅ |
| `security.scanner` | medium | security, testing | no | all | ✅ |
| `cloud.deploy` | critical | devsecops | **sí** | — | ⏳ |
| `ai.provider.call` | medium | backend ai | no | all | ✅ (CORE_SYSTEM §5) |

## Reglas
1. Toda tool nueva se registra aquí antes de usarse.
2. `requires_approval: true` en producción → paquete CHANGE-xxx + firma.
3. El frontend/UI nunca accede a tools de tipo critical directamente.
