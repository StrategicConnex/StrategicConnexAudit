# Runbook — Chatbot Sprint 2: contexto grounded y streaming en /intelligence

**Fecha:** 2026-10-27  
**Estado:** Aprobado por el owner (2026-10-27); ejecución por commits C1–C7, sin push  
**Especificación:** [2026-10-27-chatbot-sprint-2-design.md](../superpowers/specs/2026-10-27-chatbot-sprint-2-design.md)  
**Fuera de alcance:** F-SCAN/TD-22, Copilot flotante del dashboard, tablas/migraciones y despliegue/producción automática.

## Principios de ejecución

- TDD por cada commit: test que falla → cambio mínimo → test pasa → typecheck/lint afectado.
- Cada commit se crea solo tras verificar los archivos/hunks propios; no incluir cambios preexistentes del árbol.
- Los commits C1–C7 no se publican individualmente: OpenAPI queda sincronizado en C7 antes del único push final. Si se adopta push por commit en el futuro, el schema OpenAPI debe viajar en el mismo commit que cambia el wire format.
- No push/deploy hasta aprobación expresa; las medidas post-push son un paso operativo manual autorizado aparte.
- No tocar modelos, `TASK_ROUTING`, circuit breakers ni el endpoint flotante salvo actualizar sus contratos.
- Regla de autorización: **el cliente y el modelo nunca determinan el ámbito de acceso**. Todo ID se vuelve a autorizar en el servidor bajo sesión y RLS.

## Estado de superficie comprobado

- Reutilizar `useAiChat`, `src/server/ai/copilot-prompt.ts`, `callAIWithFallbackStream`, la telemetría `ttftMs`/`streamed` de `ai_usage` y `src/features/dashboard/chat/useChatHistory.ts`.
- C1 implementa el contexto IA server-side solo para la superficie `/intelligence`; los clientes legacy sin `intelligenceContext` conservan su comportamiento actual hasta que se migre la superficie flotante en un TD separado.
- `POST /api/intelligence/copilot` ya tiene contrato JSON de remediación, query RLS y test de ruta; extenderlo de forma opt-in.
- `public/openapi.json` documenta actualmente la variante JSON, sin `stream`, `references` ni payload de sugerencia.
- Tests existentes principales: `src/features/intelligence/hooks/useAiChat.test.tsx`, `src/app/api/intelligence/copilot/route.test.ts`, `src/server/ai/ai-stream.test.ts`, `tests/api-contract/contract.test.ts`.

## Commits atómicos

### C1 — `feat(chat): construir contexto de Intelligence bajo RLS`

**Staging:** solo `src/app/api/ai/copilot/route.ts`, `src/app/api/ai/copilot/route.test.ts` y, si hacen falta, módulos y tests nuevos del loader de contexto/prompt. No incluir cambios preexistentes ni archivos ajenos.

**Objetivo:** implementar una función/contrato server-side reutilizable para obtener el proyecto e investigación activos, score y hallazgos recientes (ventana de siete días), con límites explícitos; admitir únicamente IDs como contexto del cliente. En `/api/ai/copilot`, el flujo de `/intelligence` no acepta contexto de hallazgos libre del navegador. Autorizar cada ID bajo sesión y RLS; reutilizar el prompt de dominio existente y el scrubber sobre los datos recuperados por el servidor.

**Desviación D-C1-1 (aprobada por owner):** C1 también cablea `useAiChat`/`IntelligenceShell` para enviar esos IDs, adelantando parte del envío de contexto que figuraba en C6. Se incluye porque el loader/API sin consumidor dejaba C1 muerto y no permitía verificar el flujo end-to-end. C6 no vuelve a cablear IDs; se limita a streaming, memoria saliente recortada, referencias/sugerencias y borrado de memoria.

**Pruebas:**
- Unit tests del loader/context builder: IDs válidos, investigación ajena/inexistente, `projectId` e `investigationId` incompatibles, límites de filas y ventana temporal.
- Route tests de auth 401, not found/forbidden sin fuga, ID inválido 400, contexto arbitrario enviado por el cliente ignorado y prompt construido únicamente con datos recuperados bajo RLS.
- Prompt tests anti-inyección/redacción y caso sin datos.

**Gate del commit:** tests nuevos + `pnpm typecheck` + `pnpm exec eslint <archivos C1 cambiados>` + `pnpm guard:i18n` si se incorporan mensajes UI. Verificar `git diff --cached` para confirmar que el staging contiene solo C1; crear el commit únicamente después de que pasen los gates.

### C2 — `feat(chat): agregar comandos locales y memoria aislada`

**Staging:** únicamente archivos del parser/handler de comandos y memoria v2, sus pruebas y mensajes i18n correspondientes. No incluir el loader/contexto C1.

**Objetivo:** parser local de `/help`, `/finding <id>` y slash desconocido. `/finding` solo manda ID al endpoint autenticado. Extender el helper de memoria con clave `scaudit:chat:intelligence:v2:<mode>:<contextId>`, expiración 7 días, retención local compatible con límite existente de hasta 100 mensajes, y contexto saliente de máximo 10 mensajes y 8.000 caracteres recortando desde el más antiguo. Redactar la historia con el scrubber común antes del prompt.

**Pruebas:**
- Parser: `/help`, `/finding <id>`, argumento ausente/malformado y `/foo`; ayuda y comando desconocido se resuelven sin fetch.
- `/finding`: solo incluye recurso autorizado; recurso ajeno/inexistente da error genérico no revelador.
- Memoria: aislamiento por modo/contexto, 7 días, límite persistido, límite de contexto por cantidad/caracteres, truncado FIFO, scrubber, clear, exclusión de error/stream parcial, claves v1 no se importan ni mezclan.

**Gate del commit:** tests del parser/hook/storage + typecheck + eslint afectado.

### C3 — `feat(chat): preservar caché semántica sin contaminar turnos con memoria`

**Staging:** únicamente cambios al router/opciones internas de caché y tests de router. No incluir consumo SSE del cliente.

**Objetivo:** extender el input del router sin cambiar contratos de otras tareas: una opción interna explícita para desactivar caché. Turnos con historia no hacen lookup ni write L1/L2; turnos iniciales sin historia siguen tenant-scoped cacheables. Solicitudes canceladas/error no escriben caché. Sin cambio en contenido de claves existentes para los primeros turnos.

**Pruebas:**
- Tests de router (JSON y stream): historia no vacía no llama `getSemanticCache`/`setSemanticCache`; primer turno sí calcula clave tenant-scoped; respuesta completa sin historia puede guardar; error/cancelación no guarda.
- Afirmar que el flag solo afecta a estas solicitudes y no a otras tareas del router.

**Gate del commit:** `src/server/ai/ai-stream.test.ts`, tests de router pertinentes, typecheck y eslint.

### C4 — `feat(chat): emitir citas verificadas y sugerencias anti-nag`

**Staging:** únicamente validador/render de citas, sugerencia/dismissal, telemetry test y traducciones necesarias.

**Objetivo:** construir el conjunto validado de findings en servidor y cotejarlo con los marcadores de respuesta. Devuelve `references` solo para IDs reales. Marcadores no cotejados se degradan a texto plano/no link y registran en `app_logs` el evento `chat.citation.unverified` (nivel `warn`), con `correlationId`, `taskType` y conteo, sin prompt ni datos del hallazgo. Se usa `message='chat.citation.unverified'` y esos atributos van en `context`; no se añade columna ni migración. Lectura de siete días: `SELECT count(*) FROM app_logs WHERE message = 'chat.citation.unverified' AND created_at > now() - interval '7 days'`. Añadir sugerencia localizada solo ante críticos recientes, máximo una automática por contexto/24 h y dismissal en localStorage por fingerprint calculado como hash de los IDs de findings ordenados más la ventana temporal.

**Pruebas:**
- Parser/verificador de citas con referencia válida, ID inventado, formato malformado, duplicados y escaping.
- Route tests que prueban `references` dentro del conjunto recuperado bajo RLS.
- UI test para enlace válido vs texto plano sin link, contador de no verificadas.
- Sugerencia: críticos recientes visible; sin críticos ausente; CTA correcto; frecuencia 24 h; dismiss persistido por fingerprint (`hash(sorted(findingIds) + window)`); nuevo fingerprint puede mostrarse.

**Gate del commit:** tests de route/component/helper + typecheck + eslint.

### C5 — `feat(chat): plegar streaming de planes de remediación`

**Staging:** únicamente endpoint de remediación, tests route/stream y componentes de telemetría que sean imprescindibles.

**Objetivo:** aceptar `stream: true` en `/api/intelligence/copilot`; el path sin flag conserva JSON actual. Con cero hallazgos conservar JSON honesto y no invocar IA. Para plan real reutilizar `callAIWithFallbackStream`, mismos rate limit/cuota/RLS/cache scope, protocolo SSE existente, y registro `ttftMs`/`streamed` en `ai_usage`. Cada evento `chunk` transporta un delta Markdown; `done` es terminal y no contiene el plan (puede incluir solo metadatos como `modelUsed`/`fromCache`). El cliente construye el plan concatenando chunks. El cliente JSON legacy sigue recibiendo `remediationPlan` estructurado sin cambio. Error antes del primer chunk conserva respuesta JSON de error; luego, SSE emite error y cierra. No escribir caché en fallo/cancelación.

**Pruebas:**
- Ruta: JSON legado intacto; stream con headers/SSE; 0 findings devuelve ausencia JSON; failure antes de primer chunk devuelve error JSON; fallo tras chunk produce error SSE; quota/auth/RLS continúan aplicadas.
- Telemetría: `streamed=true`, `ttftMs` numérico en stream emitido; `streamed=false` y `ttftMs=null` sin chunk.
- Cache: assertions de C3 aplicadas al plan.

**Gate del commit:** route test, ai-stream tests pertinentes, typecheck y eslint.

### C6 — `feat(chat): integrar SSE, memoria y referencias en el sidebar`

**Staging:** únicamente hook/sidebar y sus tests; solo consumir los contratos establecidos en C1–C5. El envío de IDs de proyecto/investigación al chat libre ya quedó implementado y probado en C1 (desviación aprobada D-C1-1); no duplicarlo.

**Objetivo:** `useAiChat` enviará mensajes del sidebar con `stream:true` y memoria recortada a diez mensajes/8.000 caracteres, redactada antes del envío; el plan también se consume como SSE. Incrementos actualizan la burbuja existente; stop/cancel conserva parcial como interrumpido sin success; done elimina estado streaming. Renderizar referencias verificadas, acciones del canned, sugerencia proactiva y botón para borrar memoria.

**Pruebas:**
- Hook: stream chunks/done, error después de parcial, error pre-stream JSON, abort, memoria saliente recortada/redactada, references, action y regeneración/retry coherentes.
- Component tests: streaming en log, links de referencias verificadas, comando help/unknown local, `/finding`, sugerencia y dismiss, clear history.
- Consumer compatibility tests para respuesta JSON existente.

**Gate del commit:** `useAiChat.test.tsx`, tests de sidebar, `ai-stream.test.ts` no alterado salvo integración necesaria; typecheck/eslint.

### C7 — `docs(chat): sincronizar OpenAPI y contrato de chat`

**Staging:** `docs/chat/CHAT-CONTRACT.md`, `public/openapi.json`, tests estructurales del contrato y la entrada TD-24 del registro técnico. Ningún código de runtime.

**Objetivo:** actualizar `docs/chat/CHAT-CONTRACT.md` y `public/openapi.json`: request opcional `stream`; descripción de SSE (eventos chunk/done/error), conservar schema JSON en respuestas sin streaming; esquema de references; payload/acción de sugerencia; autorización server-side; cache/memory policy; errores y telemetría.

**Objetivo adicional:** registrar en este commit la deuda del Copilot flotante que aún envía `dashboardData` desde cliente (TD-24 propuesto; sin implementar su conversión en este sprint).

**Pruebas:** `pnpm test:contract` y `pnpm guard:i18n` (el contrato puede requerir solo OpenAPI structural tests; extender test si hace falta asegurar el nuevo esquema y fields). Parse JSON de OpenAPI sin pérdida de referencias y verificar que TD-24 quede registrado.

**Gate del commit:** contract tests y i18n parity.

## Orden y dependencias

`C1 → C2 → C3 → C4 → C5 → C6 → C7`.

C1 precede C4 porque el conjunto validado de citas y la sugerencia deben derivarse del loader server-side. C5 depende de C3 para bypass de caché con historia; C6 requiere C1–C5; C7 refleja contratos finales. No habrá push por commit, así que OpenAPI se sincroniza al final; si se adopta push por commit en el futuro, OpenAPI debe viajar con cada commit que cambie el wire format.

## Gates de sprint antes de considerar listo

1. Por cada commit: tests mencionados, `pnpm typecheck`, `pnpm exec eslint <archivos cambiados>` y `pnpm guard:i18n` si toca mensajes.
2. Al final: `pnpm test` completo, `pnpm test:contract`, `pnpm guard:i18n`, typecheck y build de producción local.
3. No realizar push ni deploy sin aprobación expresa del owner.
4. Medición post-push, solo tras autorización expresa: dueño = agente ejecutor; fecha = T+48 h desde la aprobación del push; lugar = `docs/audits/chat-sprint2-<fecha>.md`. Muestra mínima: n ≥ 20 turnos streamed; reportar TTFT p50 (objetivo ≤1,5 s y sin regresión vs baseline), `fromCache` de turnos iniciales antes/después y ≥1 cita real por respuesta muestreada con findings, además de errores/cancelaciones sin caché parcial. Separar laboratorio y campo. Si n < 20 a T+48 h, declarar muestra insuficiente y volver a medir a T+7 d; no declarar resultados sin datos observados.

## Condiciones conocidas

- El Copilot flotante del dashboard sigue pasando contexto cliente: TD-24 se registra en C7; la conversión server-side queda como follow-up separado.
- La puntuación del quality gate documental 15/100 es mismatch conocido de la plantilla de investigación; no se modifica/excluye en este ciclo.
- F-SCAN/TD-22 continúa como trabajo separado.
