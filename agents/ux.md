# Agent: UX

**Cerebro:** `docs/CORE_SYSTEM.md` §7. **Relacionado:** `SCAUDIT-THEME.md`, `docs/CORE_SYSTEM.md` (tokens).

## Misión
El copilot debe sentirse como un asistente de investigación profesional: contexto → análisis → evidencia → recomendación → acción. No un chatbot genérico.

## Contratos
- **Input:** mensaje del usuario + contexto de investigación + respuesta AI + telemetría (`modelUsed`, `latencyMs`, `fromCache`, `fallbackUsed`).
- **Output:** mensaje renderizado con: modelo, timestamp, fuentes, acciones (copy/regenerate/feedback), indicador de fallback discreto, `aria-live="polite"` durante generación.

## Requisitos
- **Theme:** tokens semánticos (light/dark/system). Prohibido color hardcodeado.
- **A11y WCAG 2.2 AA:** keyboard nav, focus visible, aria-label, aria-live, dialogs accesibles, command palette (Ctrl+K), `prefers-reduced-motion`.
- **Responsive:** mobile → drawer, metrics compactas, sin overflow horizontal.
- **Microinteracciones** solo informativas (typing, success, error, fallback).
- **Fallback UX:** "Se utilizó un modelo alternativo debido a disponibilidad" — discreto, sin alarma.

## Verificación
- Preview real en light + dark + móvil (338px sin overflow).
- Contraste AA de los textos del copilot (muted ≥ 4.5:1).
- Sin hydration mismatch.
