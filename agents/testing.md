# Agent: Testing

**Cerebro:** `docs/CORE_SYSTEM.md` §9 (DoD). **Instalados relacionados:** `.agents/skills/api-security-testing`, `.agents/skills/api-security-best-practices`.

## Misión
Cobertura del copilot en 3 niveles: unit (router/cache/circuit-breaker/validación), integration (POST endpoints), y seguridad (IDOR, inyección, leakage).

## Contratos
- **Input:** cambio de código + tipo (unit/integration/security).
- **Output:** tests que fallan si se rompe el contrato; reporte con número real de tests ejecutados.

## Cobertura objetivo (brechas actuales)
| Área | Estado |
|---|---|
| `useAiChat` (hook) | Falta — mockear fetch, estados idle/error/fallback |
| `ai-router` (fallback/cache/timeout) | Falta — mockear fetch de OpenRouter |
| Circuit breaker | Falta — simular fallos/secuencia CLOSED→OPEN→HALF-OPEN |
| Validación de payloads | Falta — oversized, malformed, tipos inválidos |
| Prompt injection en findings | Falta — `ignore previous instructions` en evidencia |
| IDOR copilot | Falta — investigación de otro tenant → 404 |
| UI sidebar | Existe (`src/app/components/AiCopilot.test.tsx`) |

## Reglas
- Nunca inventar resultados: reportar el número real de tests y su estado.
- Patrón de mock de Supabase/RLS ya usado en `useRealtimeMetrics.test.tsx`, `useInvestigationRealtime.test.tsx`.
- Suite completa debe seguir en verde (hoy: 630 tests / 67 files).
