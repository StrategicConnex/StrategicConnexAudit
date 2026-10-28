---
title: Contrato de chat
nav_order: 8.4
permalink: /docs/chat/chat-contract
version: 2.0
fecha: 2026-10-27
autor: StrategicConnex Engineering
estado: Vigente
---

# Contrato de chat — SCAUDIT Pro

Este documento fija el contrato observable de las superficies de chat de SCAUDIT Pro. La fuente normativa de los esquemas HTTP es `public/openapi.json` (OpenAPI 3.0.3, versión 1.1.0). Cualquier cambio de wire format requiere actualizar ambos documentos y los tests estructurales de `tests/api-contract/`.

## 1. Superficies

| Superficie | Componente | Endpoint | Transporte |
|---|---|---|---|
| Copilot flotante del dashboard | `src/features/dashboard/chat/AiCopilot.tsx` | `POST /api/ai/copilot` | JSON |
| Sidebar de Intelligence | `useAiChat.ts` + `AiCopilotSidebar.tsx` | `POST /api/ai/copilot` | SSE con `stream: true`; JSON como fallback |
| Consola de remediación | `IntelligenceTab.tsx` + `CopilotConsole.tsx` | `POST /api/intelligence/copilot` | SSE con `stream: true`; JSON como fallback |

Las tres superficies comparten autenticación, rate limit, cuota, validación de historia y política de errores. El transporte SSE es aditivo: un cliente que no envía `stream` sigue recibiendo exactamente el contrato JSON anterior.

## 2. Contrato común

### 2.1 Autorización

- La sesión se valida server-side mediante la cookie de Supabase. Sin sesión: `401`.
- Los recursos de Intelligence se resuelven server-side bajo RLS. El cliente no puede inyectar hallazgos, títulos ni severidades.
- `intelligenceContext` solo admite IDs (`projectId`, `investigationId`, `findingId`) y se valida como UUID. Un recurso inexistente o fuera del tenant responde `404`.
- `context` es el contexto del panel flotante y se delimita/escapa en servidor. Cuando llega `intelligenceContext`, este sustituye a `context` y fuerza `mode: "analyst"`.

### 2.2 Rate limit y cuota

- Ambos endpoints aplican rate limit por usuario y ventana de 60 segundos. Al excederse responden `429` con `Retry-After` y los headers `RateLimit-Limit`, `RateLimit-Remaining` y `RateLimit-Reset`.
- La cuota diaria de IA se valida antes de invocar al modelo. Al agotarse responde `429` sin abrir un stream.
- El rate limit y la cuota se aplican antes de cualquier trabajo costoso y antes del primer byte SSE.

### 2.3 Historia y memoria

- `messages` debe ser un array no vacío de turnos `{role, content}` con `role` en `user|assistant`, `content` string no vacío y **último turno `user`**. Un rol `system`, un contenido vacío o una historia que termina en `assistant` responde `400`.
- El servidor trunca la historia a un máximo de 10 turnos y 8.000 caracteres, en orden FIFO, después de validar los roles y antes del saneamiento anti-inyección. El truncado es tolerante: nunca convierte una historia válida en `400`.
- La memoria local del sidebar solo persiste mensajes completados. Los mensajes en streaming, interrumpidos o fallidos no se guardan ni se reenvían como historia.
- `clearChat` borra la memoria local de la conversación, aborta el stream activo e invalida sus callbacks. No borra la caché semántica del servidor.

## 3. `POST /api/ai/copilot` — chat general

### 3.1 Request

```json
{
  "mode": "copilot",
  "messages": [
    { "role": "user", "content": "¿Qué debería priorizar esta semana?" }
  ],
  "context": { "projects": [], "summary": { "totalProjects": 0 } },
  "intelligenceContext": {
    "projectId": "uuid",
    "investigationId": "uuid",
    "findingId": "uuid"
  },
  "stream": true
}
```

| Campo | Tipo | Obligatorio | Regla |
|---|---|---|---|
| `mode` | `"copilot" \| "analyst"` | No | Default `copilot`. Con `intelligenceContext` se fuerza `analyst`. |
| `messages` | `ChatTurn[]` | Sí | Validación y truncado de §2.3. |
| `context` | objeto \| `null` | No | Contexto del panel flotante; se delimita y escapa. |
| `intelligenceContext` | objeto | No | Solo IDs UUID; se resuelve bajo RLS y sustituye a `context`. |
| `stream` | boolean | No | Solo `true` activa SSE. Cualquier otro valor conserva JSON. |

`intelligenceContext` rechaza claves desconocidas y UUID inválidos con `400`.

### 3.2 Response JSON (sin `stream`)

```json
{
  "success": true,
  "message": "Texto real del modelo",
  "references": [{ "id": "uuid", "title": "Hallazgo verificado" }],
  "unverifiedCount": 0,
  "suggestion": null,
  "modelUsed": "proveedor/modelo",
  "fromCache": false
}
```

- `success: true` solo si hay contenido real del modelo o una respuesta real servida desde caché. Un fallo nunca devuelve `success: true` con texto inventado.
- `references` contiene únicamente hallazgos resueltos bajo RLS. Un marcador `[[finding:<id>]]` que no pertenece a ese conjunto queda como texto plano y se cuenta en `unverifiedCount`.
- `suggestion` es `null` o un objeto server-side `{fingerprint, findingIds, investigationId, text, ctaLabel}`. Solo se emite con hallazgos `critical` de los últimos 7 días y una investigación real; el modelo no redacta ni elige el texto ni el CTA.
- `fromCache: true` indica una respuesta real previamente cacheada, no una respuesta fabricada.

### 3.3 Response SSE (`stream: true`)

Headers:

```http
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

Eventos, cada uno como `data: <json>\n\n`:

```text
data: {"type":"chunk","text":"## Prioridades\n"}

data: {"type":"chunk","text":"1. Revisar DMARC"}

data: {"type":"done","modelUsed":"proveedor/modelo","fromCache":false,"references":[{"id":"uuid","title":"Hallazgo"}],"unverifiedCount":0,"suggestion":null}
```

- `chunk` contiene un delta de texto Markdown. El cliente concatena los deltas; no se envía el mensaje completo en `done`.
- `done` es terminal y contiene `modelUsed` y `fromCache`. Añade `references` solo si hay referencias verificadas, `unverifiedCount` solo si es mayor que 0 y `suggestion` solo si existe. Sin extras, el evento es exactamente `{"type":"done","modelUsed":...,"fromCache":...}`.
- El cliente normaliza `[[finding:<id>]]` a `[[ref:n]]` solo cuando el `id` aparece en `references`; en caso contrario conserva el marcador literal. `references` nunca incluye IDs inventados.
- `error` es terminal cuando el fallo ocurre después del primer chunk: `{"type":"error","message":"..."}`. No se envía `done`, el parcial se conserva como interrumpido y no se persiste.
- Si el pool falla antes del primer chunk, no se abre SSE: se devuelve el JSON legado de error (`503`), o el JSON de onboarding cuando no hay claves de IA configuradas (`200`, `success: true`, mensaje explicativo). Un `error` SSE nunca se transforma en éxito.

## 4. `POST /api/intelligence/copilot` — plan de remediación

### 4.1 Request

```json
{
  "investigationId": "uuid",
  "stream": true
}
```

`investigationId` es obligatorio. Sin él: `400`. La investigación se carga bajo RLS junto con sus hallazgos (máximo 100); si no existe o no pertenece al tenant: `404`.

### 4.2 Cero hallazgos

Si la investigación no tiene hallazgos, la respuesta es JSON —también con `stream: true`— y **no se invoca IA**:

```json
{
  "success": true,
  "hasFindings": false,
  "remediationPlan": "Mensaje localizado de ausencia de hallazgos",
  "action": {
    "href": "/intelligence#intelligence-scan",
    "label": "Ejecutar análisis"
  }
}
```

### 4.3 Response JSON con hallazgos

```json
{
  "success": true,
  "hasFindings": true,
  "remediationPlan": "Plan Markdown real del modelo",
  "modelUsed": "proveedor/modelo",
  "fromCache": false
}
```

El plan es siempre contenido real del modelo o una respuesta real cacheada. Nunca se fabrica un plan de relleno.

### 4.4 Response SSE con hallazgos

Mismos headers y framing que §3.3.

```text
data: {"type":"chunk","text":"## Plan de remediación\n"}

data: {"type":"chunk","text":"1. Priorizar el hallazgo crítico"}

data: {"type":"done","modelUsed":"proveedor/modelo","fromCache":false}
```

- `chunk` lleva deltas Markdown del plan.
- `done` es terminal y **no incluye `remediationPlan`**; el cliente reconstruye el plan concatenando los chunks.
- `error` tras el primer chunk conserva el parcial como interrumpido y no se cachea.
- Un fallo antes del primer chunk devuelve `503` JSON con `{success:false, hasFindings:true, error}`. Una excepción no controlada devuelve `500` con `{success:false, error}`.

## 5. Wire format SSE

- Codificación UTF-8; cada evento ocupa una línea `data: ` con JSON y termina en una línea vacía.
- No se emiten `id:`, `retry:` ni un evento `[DONE]`.
- `chunk` es incremental; `done` y `error` son terminales y mutuamente excluyentes.
- Un stream cancelado por el cliente no se considera completado. El servidor no escribe caché de una respuesta parcial: el router solo cachea al completar el stream.
- El cliente que consume SSE debe tolerar líneas desconocidas o malformadas sin romper la conversación.

## 6. Errores

| Situación | HTTP / evento | Cuerpo | Efecto en UI |
|---|---|---|---|
| Historia inválida (rol, contenido o último turno) | `400` | `{success:false,error}` | Error localizado; no se crea respuesta |
| `intelligenceContext` inválido | `400` | `{success:false,error}` | Error; no se invoca IA |
| Sin sesión | `401` | `{success:false,error}` | Redirección o error de sesión |
| Recurso de Intelligence inaccesible | `404` | `{success:false,error}` | Error; no se filtra existencia |
| Rate limit o cuota | `429` | `{success:false,error}` + `Retry-After` | Reintento tras la ventana |
| Fallo inesperado | `500` | `{success:false,error}` | Error con reintento |
| Pool de IA no disponible antes del primer chunk | `503` | JSON legado `{success:false,error,...}` | Error con reintento |
| Fallo después del primer chunk | `200` SSE + `event:error` | `{"type":"error","message"}` | Parcial marcado como interrumpido |
| Sin claves de IA | `200` | JSON de onboarding `{success:true,message,error}` | Mensaje explicativo, sin respuesta falsa |

Invariantes:

1. Un fallo nunca devuelve `success: true` con contenido inventado.
2. Un plan de remediación nunca se fabrica si no hay hallazgos o si el modelo falla.
3. No se usan temporizadores para simular progreso.
4. La UI ofrece reintento o conserva el parcial interrumpido de forma explícita.
5. No se muestran datos demo como si fueran hallazgos recientes.

## 7. Caché y cancelación

- La caché semántica del chat general usa scope por usuario (`cacheScope: user:<userId>`).
- El primer turno puede usar caché semántica. Con más de un turno `user`, la caché semántica se desactiva para no contaminar turnos con memoria.
- El plan de remediación usa `taskType: copilot-remediation` y el mismo `cacheScope` por usuario.
- Un stream cancelado, interrumpido o fallido no se cachea. Solo una respuesta completa puede servirse desde caché.
- `stopGenerating` aborta la petición y conserva el texto parcial como interrumpido; no lo guarda ni lo reenvía.

## 8. Citas y sugerencias

- Una cita solo se convierte en enlace si el hallazgo fue resuelto bajo RLS y aparece en `references`.
- `[[ref:n]]` es el marcador final que renderiza la UI; `n` es el índice 1-based de `references`.
- Un marcador sin coincidencia permanece como texto plano y suma a `unverifiedCount`.
- La sugerencia proactiva se calcula en servidor: fingerprint estable, ventana de 7 días, solo severidad `critical` e investigación real. El cliente aplica anti-nag de 24 horas y descarte persistente por fingerprint.
- El texto y el CTA de la sugerencia salen de plantillas i18n; el modelo no los redacta.

## 9. Telemetría

- `ai_usage` registra `streamed` y `ttftMs` para respuestas SSE; los streams no completados no se contabilizan como éxito.
- `app_logs` registra `chat.citation.unverified` con `{correlationId, taskType, count}`. No incluye prompt, respuesta, título ni contenido de hallazgos.
- `correlationId` procede del header `x-request-id` o de un UUID generado en servidor.
- La telemetría es observabilidad, no una fuente de contenido para la UI.

## 10. i18n

- Namespace `chat.*` para el sidebar y `intelligence.*` para la consola de remediación.
- Claves nuevas de Sprint 2: `clearHistory` e `interrupted`, presentes en `messages/es.json` y `messages/en.json`.
- Estado actual: `es=830`, `en=830`, divergencia 0.00%. El gate `guard:i18n` falla si la divergencia supera el 2%.

## 11. Compatibilidad y versionado

- JSON sin `stream` es el contrato estable y permanece intacto.
- SSE es aditivo y opt-in mediante `stream: true`.
- Un cliente antiguo que ignore `references`, `unverifiedCount` o `suggestion` sigue funcionando.
- Cambios incompatibles requieren nueva versión de este documento, actualización de `public/openapi.json` y tests de contrato.

## 12. Referencias y pruebas

- OpenAPI: `public/openapi.json` documenta `POST /api/ai/copilot` y `POST /api/intelligence/copilot`, sus schemas `ChatTurn`, `ChatReference`, `ChatSuggestion`, `ChatRequest`, `ChatResponse` y `ChatStreamEvent`, y el contenido `text/event-stream`.
- Contrato estructural: `tests/api-contract/contract.test.ts` y `tests/api-contract/chat-contract.test.ts`.
- Rutas: `src/app/api/ai/copilot/route.test.ts`, `src/app/api/intelligence/copilot/route.test.ts`.
- Router y streaming: `src/server/ai/ai-stream.test.ts`.
- Hook y sidebar: `src/features/intelligence/hooks/useAiChat.test.tsx`, `src/features/intelligence/components/AiCopilotSidebar.test.tsx`.
- Parser SSE compartido: `src/features/dashboard/chat/chat-stream.ts` y sus tests.
- Gate de sprint: suite completa, `test:contract`, `guard:i18n`, `typecheck` y build de producción.

## 13. Deuda registrada — TD-24

El Copilot flotante del dashboard todavía construye y envía `dashboardData` desde el cliente. El servidor lo delimita y escapa, pero no puede verificar su integridad ni acotarlo al tenant como haría un loader server-side. La conversión a contexto server-side queda registrada como **TD-24** en `docs/technical-debt/TECH-DEBT-REGISTER.md` y se abordará como follow-up posterior al Sprint 2; no forma parte de este contrato ni de la implementación actual.
