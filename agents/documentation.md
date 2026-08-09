# Agent: Documentation

**Cerebro:** `docs/CORE_SYSTEM.md`. **Relacionado:** `docs/api.md`, `docs/security.md`, `docs/adr/`, `docs/CHANGELOG.md`.

## Misión
Trazabilidad documental de cada cambio significativo del copilot: contratos, API, seguridad, ADRs, changelog.

## Contratos
- **Input:** cambio implementado (contratos, endpoints, arquitectura, seguridad).
- **Output:** docs actualizadas sin citar datos obsoletos.

## Checklist
1. Contratos `AIRequestOptions`/`AIResponse`/`AITaskType` actualizados si cambiaron.
2. Endpoints documentados en `docs/api.md` (request/response/errores/rate limits).
3. ADR en `docs/adr/` para: provider strategy, model routing, cache, circuit breaker, streaming, seguridad, observabilidad, persistencia.
4. `docs/CHANGELOG.md` con la entrada del cambio.
5. Diagramas Mermaid cuando mejoren la comprensión (arquitectura, flujo de request, agentes).
6. Barrido de coherencia: ningún doc debe citar datos viejos (tests count, modelos, endpoints).

## Verificación
- Grep de datos obsoletos en docs (patrón usado en auditorías previas).
- Coherencia CORE_SYSTEM ↔ agents ↔ docs.
