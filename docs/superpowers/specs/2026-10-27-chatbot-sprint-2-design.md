# Diseño — Chatbot Sprint 2: contexto grounded y conversación progresiva

**Fecha:** 2026-10-27  
**Estado:** Aprobado por el owner (2026-10-27); ejecución iniciada — C1 incluye la desviación aprobada D-C1-1  
**Base:** `docs/plans/CHATBOT-IMPROVEMENT-PLAN.md`, Sprint 2, más memoria/streaming aún no plegados en `/intelligence`.

## Objetivo

Completar la experiencia conversacional de `/intelligence` con prompts de dominio, contexto autorizado y citas reales, memoria local acotada, comandos `/finding` y `/help`, sugerencias proactivas basadas en hallazgos reales y streaming tanto para el chat libre como para el plan de remediación. Se conserva el contrato JSON existente para consumidores que no solicitan streaming.

Este bloque cubre las Tasks 2.1–2.4 del plan y el plegado de memoria/streaming en las superficies de `/intelligence`. **F-SCAN (TD-22) queda fuera de este bloque** y requiere su propio diseño/implementación: reemplazar progreso ficticio por eventos reales de escaneo.

## Enfoques considerados

1. **Extender las rutas y el hook existentes (seleccionado):** reutiliza `/api/ai/copilot`, `/api/intelligence/copilot`, `useAiChat`, el protocolo SSE existente, la política RLS y los mecanismos actuales de cuota/rate-limit. Streaming es opt-in y no rompe el JSON legado.
2. **Crear una API unificada de chat para Intelligence:** simplifica el cliente, pero duplica o desplaza autorización, cuota, RLS y lógica específica de remediación.
3. **Transmitir solo el chat libre:** cambio menor, pero deja el flujo de planes con una UX distinta y no satisface la decisión de transmitir ambos.

## Arquitectura y flujo

- `useAiChat` seguirá siendo el hook canónico del sidebar. En `/intelligence`, el chat libre y el botón de plan enviarán solicitudes a sus rutas actuales con streaming optativo.
- `POST /api/ai/copilot` seguirá admitiendo el contrato existente. Para el contexto de Intelligence recibirá solo identificadores del recurso activo y el modo de dominio; el servidor recuperará los datos bajo sesión y RLS, construirá el prompt de ciberseguridad y pasará al modelo únicamente contexto validado. No confiará en contenido de hallazgos enviado por el navegador.
- `POST /api/intelligence/copilot` conservará el JSON actual por defecto y aceptará `stream: true` para el plan de remediación. Sin hallazgos seguirá devolviendo el mensaje de ausencia honesto y el CTA real, sin invocar el modelo.
- SSE reutilizará el formato actual (`chunk`, `done`, `error`). En el plan de remediación, cada `chunk` transporta un delta Markdown; `done` es terminal sin cuerpo de plan (puede llevar solo metadatos como `modelUsed`/`fromCache`). El cliente construye el plan concatenando chunks; los clientes JSON legacy siguen recibiendo `remediationPlan` estructurado sin cambio. El cliente mostrará texto parcial por fragmentos y admitirá cancelación; si falla tras emitir texto, conserva el parcial marcado como error. Nunca marcará como completa una respuesta sin evento `done`.
- Los prompts separarán intención general de análisis/triage/remediación y aplicarán las reglas actuales de no inventar información, anti-inyección y redacción de datos sensibles.

## Contexto, comandos, referencias y sugerencias

- El servidor obtendrá proyecto e investigación activos, score y hallazgos recientes dentro de la ventana de siete días, siempre bajo autenticación/RLS y con límites explícitos.
- `/help` se resolverá localmente y mostrará ayuda localizada; no se enviará al modelo. Cualquier comando slash desconocido también responderá localmente con un mensaje i18n que remite a `/help`, sin llamar al modelo.
- `/finding <id>` enviará al servidor solo el ID. El servidor comprobará que el hallazgo pertenece a una investigación/proyecto accesible antes de incorporarlo al prompt. ID faltante, inválido, inexistente o ajeno produce un error comprensible y no filtra datos.
- Las citas se basarán exclusivamente en hallazgos que el servidor cargó y validó. Los marcadores de cita del modelo se cotejarán contra ese conjunto: los válidos se exponen como `references` verificadas y se enlazan; los que no coinciden se degradan a texto plano, nunca a enlace, y generan en `app_logs` el evento `chat.citation.unverified` (nivel `warn`), con `correlationId`, `taskType` y conteo, sin registrar prompt ni datos del hallazgo. Se usa `message='chat.citation.unverified'` y esos atributos van en `context`; no se añade columna ni migración. Lectura de siete días: `SELECT count(*) FROM app_logs WHERE message = 'chat.citation.unverified' AND created_at > now() - interval '7 days'`.
- La sugerencia proactiva aparecerá solo si existen hallazgos críticos dentro de la ventana definida; estará localizada y enlazará al flujo real de plan. Se limitará a una exposición automática por contexto en 24 horas y permitirá descartar la sugerencia; el descarte persistirá en localStorage por fingerprint `hash(sorted(findingIds) + window)`, de modo que un conjunto nuevo o una ventana nueva pueda volver a sugerirse.

## Memoria y privacidad

- Memoria solo en el navegador; no se crea tabla ni sincronización server-side en este bloque.
- Retención de siete días; se conserva hasta el máximo ya soportado por el helper local (100 mensajes), mientras que cada request envía como máximo diez mensajes previos y 8.000 caracteres de contexto. La UI ofrece una acción para borrar la memoria. El estado almacenado se limita a mensajes completados, excluyendo errores y streams parciales.
- Además del límite de cantidad, el contexto de memoria se limita a 8.000 caracteres (aproximadamente 2.500 tokens), recortando desde el mensaje más antiguo hasta ajustarse al presupuesto. Los mensajes pasan por el mismo redactor de datos sensibles antes de entrar al prompt.
- La memoria se separa por investigación/proyecto activo para evitar mezclar datos entre contextos. Al cambiar de contexto se recupera únicamente su propia conversación.
- La clave de memoria de Intelligence usa una versión y namespace nuevos (`scaudit:chat:intelligence:v2:<mode>:<contextId>`). No se infiere ni migra historial legado sin contexto: las claves genéricas existentes del panel flotante no se leen ni se borran; quedan bajo su propietario/TTL actual. La nueva memoria comienza limpia por contexto.
- Se reutilizará el helper de historial local existente cuando sea compatible; si su clave o límite actual no satisfacen el aislamiento por contexto, se adaptará sin introducir otra capa de persistencia.

## Seguridad, caché, errores y compatibilidad

- Mantener autenticación, rate limit, cuota IA, RLS, aislamiento por usuario y caché tenant-scoped. Principio normativo: **el cliente y el modelo nunca determinan el ámbito de acceso**; el servidor autentica y autoriza cada identificador bajo RLS.
- **Caché y memoria:** las solicitudes que incluyen historia conversacional omiten lectura y escritura de caché semántica L1/L2. Solo turnos sin historia usan la clave tenant-scoped existente. Una solicitud cancelada o un stream terminado en error nunca escribe caché. El hit-rate `fromCache` de turnos sin historia se compara antes/después del despliegue.
- El contexto de conversación se recorta a diez mensajes y 8.000 caracteres (≈2.500 tokens), desde el mensaje más antiguo, y se redacta con el mismo scrubber que el contexto de proyecto.
- Reutilizar `callAIWithFallbackStream`; no cambiar proveedores, circuit breakers ni `TASK_ROUTING` como parte de este diseño. El endpoint de remediación registra `ttft_ms` y `streamed` en `ai_usage`; la prueba del route/router fija este contrato.
- Las respuestas JSON legadas seguirán funcionando si no se solicita streaming. Una caída antes del primer chunk conserva la respuesta JSON de error/ausencia existente; después del primer chunk se emite `error` y se cierra el stream.
- Las solicitudes canceladas no se persisten como respuestas completas ni se presentan como éxito. Los fallos del proveedor mantienen semántica de error visible; no se convierten en mensajes exitosos.
- Textos de prompts visibles, comandos, estados y errores necesarios para la UI mantienen paridad `es`/`en`. OpenAPI y `CHAT-CONTRACT.md` se actualizan con `stream`, `references`, la sugerencia y el principio de autorización. OpenAPI se sincroniza al final porque no habrá push por commit; si en el futuro se adopta push por commit, el schema viaja en el mismo commit que cambia el wire format.

## Criterios de aceptación y verificación

1. Contexto de Intelligence se obtiene server-side bajo RLS; pruebas demuestran rechazo de IDs inválidos y de recursos ajenos, y ausencia de datos del tenant en respuestas no autorizadas.
2. Prompts de dominio usan datos reales, delimitados y redactados; con contexto vacío el modelo no inventa recursos.
3. `/help` y comandos slash desconocidos responden localmente; `/finding <id>` incluye un hallazgo autorizado y rechaza uno inexistente/ajeno sin filtración.
4. Con hallazgos disponibles, ≥1 cita real por respuesta de prueba; referencias enlazadas corresponden a IDs permitidos. Una cita no cotejada aparece como texto plano y aumenta el contador/métrica de no verificada.
5. La sugerencia proactiva solo aparece ante hallazgos críticos recientes, apunta a la acción real, respeta frecuencia de 24 h y su dismissal persiste por fingerprint; no aparece tarjeta ficticia en cuenta sin hallazgos.
6. Memoria: persiste entre recargas dentro de los siete días, se limita a diez mensajes y 8.000 caracteres de contexto, se aísla por contexto, expira y puede borrarse; mensajes sensibles se redactan y errores/parciales no se guardan. Claves v1/genéricas nunca se mezclan ni migran a Intelligence v2.
7. Historia no vacía evita cache lookup/write; primer turno sigue tenant-scoped cacheable. Cancelación y error no escriben caché. Pruebas confirman el comportamiento y la telemetría de cache hit.
8. Chat libre y plan de remediación muestran chunks progresivos, finalizan con `done`, reflejan errores posteriores al primer chunk y soportan cancelación sin falso éxito. El endpoint de plan registra `ttft_ms`/`streamed`.
9. Consumidores sin `stream: true` mantienen JSON compatible. OpenAPI y `CHAT-CONTRACT.md` reflejan request/response SSE, `references`, sugerencias y autorización. Paridad i18n pasa.
10. Validación post-push (solo con autorización expresa): dueño = agente ejecutor; fecha = T+48 h desde aprobación del push; lugar = `docs/audits/chat-sprint2-<fecha>.md`. Muestra mínima n ≥ 20 turnos streamed. Comparar `fromCache` de primeros turnos y TTFT p50 (objetivo ≤1,5 s, sin regresión respecto al baseline previo); en cada respuesta muestreada con hallazgos, verificar ≥1 cita real; separar laboratorio y campo. Si n < 20 a T+48 h, declarar muestra insuficiente y releer a T+7 d. Reportar tamaños de muestra y no presentar laboratorio como dato de campo.
11. Verificación mínima de implementación: tests de rutas, hook/cliente, prompt/contexto, caché y almacenamiento afectados; typecheck y paridad i18n. Ejecutar suite completa antes de push conforme al plan de repositorio.

## Fuera de alcance

- F-SCAN/TD-22: estado real del progreso de escaneo desde `intelligence_run_events`.
- Persistencia de conversación en servidor, sincronización entre dispositivos, exportación del chat.
- Crear un endpoint unificado o una tabla/migración nueva.
- Desplegar, hacer push o alterar producción como parte del diseño.

## Fuera de alcance adicional / notas conocidas

- El Copilot flotante del dashboard aún envía `dashboardData` desde el cliente; su conversión a identificadores y contexto server-side queda como TD-24/follow-up, no se amplía este ciclo.
- `quality-gate.mjs` puntúa 15/100 este documento por mismatch conocido de plantilla de investigación; es baseline preexistente y no se modifica ni se excluye del gate en este ciclo.

## Auto-revisión

- **Alcance:** se distingue el bloque de chat del trabajo independiente F-SCAN.
- **Compatibilidad:** el streaming es optativo; se preserva el contrato JSON legado.
- **Aislamiento:** datos y citas se autorizan y validan en servidor; memoria separada por contexto.
- **Cache/memoria:** la historia desactiva explícitamente lookup/write semántico; las solicitudes canceladas y fallidas no escriben caché.
- **Límites:** memoria local conserva hasta 100 mensajes por TTL de siete días; el prompt recibe como máximo diez mensajes/8.000 caracteres y se redacta antes de usarse.
- **Ambigüedad resuelta:** `/help` y comandos desconocidos son locales; `/finding` requiere validación server-side; historial de siete días, máximo 10 mensajes/8.000 caracteres de contexto.
- **Sin marcadores pendientes:** no quedan secciones sin decidir ni dependencias de producto externas añadidas.