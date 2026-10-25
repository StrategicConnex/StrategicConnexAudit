# Contrato de chat — superficies, endpoints y semántica de error

**Versión:** 1.0 · 2026-10-21
**Alcance:** Sprint 0 del plan `docs/plans/CHATBOT-IMPROVEMENT-PLAN.md` (Tasks 0.1–0.11 y transversal A1)
**Estado:** vigente

Este documento es el contrato único de las tres superficies de chat de la
aplicación. Cualquier cambio de request, response o semántica de error debe
actualizar este archivo, `public/openapi.json` y los tests citados al final.

## 1. Superficies

| Superficie | Implementación | Hook | Endpoint principal |
|---|---|---|---|
| Panel flotante del dashboard | `src/features/dashboard/AiCopilot.tsx` | Ninguno propio (fetch inline) | `POST /api/ai/copilot` |
| Sidebar de Intelligence | `src/features/intelligence/hooks/useAiChat.ts` + `src/features/intelligence/components/AiCopilotSidebar.tsx` | `useAiChat` | `POST /api/ai/copilot` y `POST /api/intelligence/copilot` |
| Consola de remediación | `src/features/dashboard/tabs/IntelligenceTab.tsx` + `src/features/dashboard/tabs/intelligence/CopilotConsole.tsx` | Estado local del tab | `POST /api/intelligence/copilot` |

`useAiChat` es el **único hook cliente de chat** del repositorio. El panel
flotante no crea un hook duplicado: mantiene su propio estado porque necesita
enviar `context` y conservar el prompt fallido para el botón de reintento. Su
contrato HTTP es el mismo que el del sidebar. Si en el futuro se unifica la
lógica, el hook canónico seguirá siendo uno solo (`useAiChat`, o `useChatReal`
si se renombra); no se admiten dos hooks con contratos divergentes.

## 2. `POST /api/ai/copilot` — chat general

Request:

```json
{
  "mode": "copilot",
  "messages": [
    { "role": "user", "content": "¿Qué puertos abiertos tengo?" }
  ],
  "context": {}
}
```

`context` es opcional y solo lo envía el panel flotante. El servidor construye
el prompt con `src/server/ai/copilot-prompt.ts`, delimita el contexto del
tenant y escapa los datos para que no se interpreten como instrucciones.

Response 200:

```json
{
  "success": true,
  "message": "Respuesta real del modelo",
  "modelUsed": "proveedor/modelo",
  "fromCache": false
}
```

Reglas:

- `success: true` **solo** si hay una respuesta real del modelo.
- Un fallo del pool responde `503` con `success: false` y `error`.
- Cuota o rate limit responde `429` con `success: false`, `error` y
  `Retry-After`.
- Un body inválido responde `400`; sin sesión, `401`.
- Nunca se devuelve un mensaje canned como si fuera una respuesta del modelo.

## 3. `POST /api/intelligence/copilot` — plan de remediación

Request:

```json
{ "investigationId": "uuid" }
```

Response 200 con hallazgos:

```json
{
  "success": true,
  "hasFindings": true,
  "remediationPlan": "Plan real generado por el modelo…",
  "modelUsed": "proveedor/modelo",
  "fromCache": false
}
```

Response 200 sin hallazgos:

```json
{
  "success": true,
  "hasFindings": false,
  "remediationPlan": "La investigación aún no tiene hallazgos. Inicia un escaneo para generar datos reales.",
  "action": {
    "href": "/intelligence#intelligence-scan",
    "label": "Escanear infraestructura"
  }
}
```

Reglas de honestidad:

- Con `hasFindings: false` la respuesta es un **mensaje de ausencia**, no un
  plan. No se inventan pasos de remediación ni se afirma que la infraestructura
  está limpia sin datos.
- `action` solo se emite cuando `hasFindings` es `false`; apunta a la ejecución
  real de tools (`/intelligence#intelligence-scan`), no a una simulación.
- Con hallazgos, `remediationPlan` es el contenido real del modelo. Si el
  modelo falla, la respuesta es `503` con `success: false` y `error`, sin
  `remediationPlan`; el cliente muestra el error y no presenta ningún fallback
  como plan.
- Sin `investigationId` → `400`; investigación inexistente o sin acceso → `404`;
  sin sesión → `401`; rate limit/cuota → `429`; excepción interna → `500` con
  `success: false` y sin `remediationPlan`.
- Los textos de ausencia y del CTA salen de i18n
  (`intelligence.copilotNoFindings` y `intelligence.copilotRunScan`) según el
  locale de la request (`es`/`en`).

## 4. Semántica de error común

| Status | Significado | `success` | Campos |
|---|---|---|---|
| 200 | Respuesta real o ausencia honesta | `true` | `message` o `hasFindings` + `remediationPlan`; `action` solo en ausencia |
| 400 | Body/ID inválido | `false` | `error` |
| 401 | Sin sesión | `false` | `error` |
| 404 | Investigación inexistente o sin acceso | `false` | `error` |
| 429 | Cuota/rate limit | `false` | `error`, `Retry-After` |
| 500 | Error interno | `false` | `error`; nunca `remediationPlan` |
| 503 | Pool de IA no disponible | `false` | `error` |

Invariantes:

1. Un fallo **nunca** responde `success: true`.
2. Un fallo **nunca** se renderiza como plan o como respuesta del asistente.
3. No se usan `setTimeout` ni pasos temporizados para simular progreso.
4. Los errores se muestran en la UI con un mensaje comprensible y, cuando
   aplica, un botón de reintento que no duplica el mensaje del usuario.
5. Los datos demo no se presentan con timestamps de recencia.

## 5. i18n

- Namespace `chat.*` para las tres superficies (saludo, errores, generación,
  copia, accesibilidad).
- Namespace `intelligence.*` para la ausencia de hallazgos y el CTA de escaneo.
- `es` y `en` deben mantener paridad; el gate es
  `node scripts/i18n-parity.mjs --max-divergence 0.02`.

## 6. Referencias y tests

- OpenAPI: `public/openapi.json` (`/api/intelligence/copilot`,
  `CopilotResponse`, `CopilotAction`).
- Contrato OpenAPI: `tests/api-contract/contract.test.ts`.
- Endpoint de remediación: `src/app/api/intelligence/copilot/route.test.ts`.
- Chat general: `src/app/api/ai/copilot/route.test.ts`.
- Hook canónico: `src/features/intelligence/hooks/useAiChat.test.tsx`.
- Sidebar: `src/features/intelligence/components/AiCopilotSidebar.test.tsx`.
- Consola: `src/features/dashboard/tabs/intelligence/CopilotConsole.test.tsx`.
- Panel flotante: `src/features/dashboard/AiCopilot.test.tsx`.
- CSP de las rutas críticas: `e2e/csp.spec.ts` + `playwright.csp.config.ts`.
