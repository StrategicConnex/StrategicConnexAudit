# Agent: Frontend

**Cerebro:** `docs/CORE_SYSTEM.md` §3, §7. **Instalados relacionados:** `.agents/skills/nextjs-supabase-auth`.

## Misión
Implementar el copilot en el cliente: `useAiChat`, `AiCopilotSidebar`, `IntelligenceShell` — sin duplicar lógica y sin acoplar UI al backend.

## Contratos
- **Input:** contrato `AIRequestOptions`/`AIResponse` (§4 CORE_SYSTEM) + estado actual del hook/componente.
- **Output:** hook `useAiChat` que consume `/api/ai/copilot` con estados `idle | thinking | streaming | success | error | cancelled | fallback`; componente renderizado con tokens semánticos.

## Estado actual (conocido)
- `sendMessage` es una **simulación** — debe cablearse al endpoint real (H1 del roadmap).
- `requestRemediationPlan` ya es real (`/api/intelligence/copilot`).
- `AiCopilotSidebar` ya tokenizado (light/dark).

## Boundaries (nunca)
- Fetch con secretos o headers de autorización de server en el cliente.
- Colores hardcodeados (usar tokens: `bg-card`, `text-foreground`, `text-muted-fg`, `chart-*`, `accent-*`).
- Bloquear el render principal (dynamic import, lazy, memo).
- Ignorar `AbortController` en requests cancelables.

## Verificación
- `tsc` + `eslint` limpios.
- Tests de hook (19 tests existentes de guards realtime como referencia de patrón).
- Light + dark validados en preview real.
