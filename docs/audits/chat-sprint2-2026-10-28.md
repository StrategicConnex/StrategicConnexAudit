# Auditoría Chatbot Sprint 2 — cierre REQ-CHAT-SPRINT2

- **Generado:** 2026-10-28T12:09:45Z (push origin/main → 2dd4a91)
- **Validación de campo programada:** 2026-10-30T12:09:45Z (T+48h)
- **Commit base:** 2dd4a91 (docs/chat: sincronizar OpenAPI y contrato de chat)
- **Push:** completado en turno previo (main -> origin/main)
- **Dueño ejecución:** agente (autorizado)
- **Alcance:** validación post-push según `docs/plans/2026-10-27-chatbot-sprint-2-implementation-plan.md` §Criterios

## Estado de gates (laboratorio)
| Check | Estado | Evidencia |
|---|---|---|
| `pnpm typecheck` | OK | sin errores |
| `pnpm test:contract` | OK (38/38) | chat-contract, contract, public-api-matrix |
| `pnpm guard:i18n` | OK (es=830 en=830, 0.00%) | scripts/i18n-parity.mjs |
| Commits C1–C7 | OK | ca4ad20..2dd4a91 presentes en historial |

## Verificación de implementación (criterios clave)
| Criterio | Estado | Evidencia |
|---|---|---|
| Contexto server-side bajo RLS + IDs validados | OK | `src/app/api/ai/copilot/route.ts`, tests de ruta |
| Comandos locales `/help`, `/finding <id>`, unknown | OK | parser/memoria v2, tests |
| Memoria aislada por contexto (v2), 10 msgs/8000 chars, 7 días, redactada | OK | `src/features/intelligence/lib/chat-memory.ts`, tests |
| Caché bypass con historia conversacional | OK | router con flag interno, tests |
| Citas verificadas + `unverifiedCount` + `chat.citation.unverified` log | OK | validación server-side, evento en app_logs sin datos sensibles |
| Sugerencias anti-nag (fingerprint + 24h) | OK | implementación + tests |
| Streaming SSE chat libre y plan remediación, cancelación, error post-chunk | OK | routes + hook + parser SSE |
| OpenAPI/CHAT-CONTRACT sincronizados | OK | C7, tests estructurales |

## Verificación de campo (pendiente / planificada)
**Requisito:** T+48h desde aprobación de push, muestra n ≥ 20 turnos streamed, separar laboratorio/campo.

Plan de ejecución:
1. Cuenta real con hallazgos críticos en `/intelligence` (verificar acceso/autorización)
2. 5-10 preguntas variadas cubriendo triage/remediación/contexto
3. Por cada respuesta muestreada con hallazgos: verificar ≥1 cita real, `unverifiedCount==0`, sin tarjetas ficticias
4. Consultar `app_logs` últimos 24h: `message='chat.citation.unverified'` (objetivo 0 nuevos o justificados)
5. Medir TTFT p50 de turnos streamed (objetivo ≤1.5s, sin regresión vs baseline) y `fromCache` en primeros turnos

**Estado actual:** Push realizado; ventana T+48h aún no transcurrida. Se declara **muestra insuficiente para cierre con evidencia de campo completa** conforme al plan. Se re-evaluará a T+48h (y si n<20 a T+7d) con evidencia objetiva (logs/trace + capturas).

## Conclusión provisional
- **Implementación:** Completa y con gates verdes.
- **Cierre REQ-CHAT-SPRINT2:** **Pendiente validación de campo**. Se mantiene abierto hasta completar la verificación post-push con evidencia en este documento.

---

## Sesión de campo T+48h — ejecutada 2026-10-30

- **Ejecutada:** 2026-10-30T15:02Z (ventana T+48h abierta desde 2026-10-28T12:09Z; +2 h 53 min de margen)
- **Base:** `https://scaudit.vercel.app` (deployment de `2dd4a91` en `main`)
- **Sesión:** cuenta de smoke del `.env.local` (`TEST_AUTH_EMAIL`), proyecto «Sprint 0 temp» (`example.com`), investigación `fe97e379-2d12-44c5-9d8f-3d036d2862be`
- **Método:** 7 turnos reales contra `POST /api/ai/copilot` con `stream: true` e `intelligenceContext` (projectId + investigationId), espaciados 13 s por el rate limit de 5/60 s; lectura incremental del SSE para medir TTFT. Solo lectura de BD (`app_logs`) para el conteo de citas no verificadas.

| Turno | HTTP | TTFT | Total | Chunks | Citas | `unverifiedCount` | `done` |
|---|---|---|---|---|---|---|---|
| triage («¿qué priorizo esta semana?») | 200 | 9 205 ms | 10 552 ms | 641 | 0 | 1 | ✅ |
| remediación (plan paso a paso) | 200 | 7 236 ms | 8 574 ms | 641 | 0 | 1 | ✅ |
| conocimiento (DMARC + dig) | 200 | 3 280 ms | 3 859 ms | 284 | 0 | 0 | ✅ |
| comando `/help` | 200 | 3 934 ms | 4 773 ms | 410 | 0 | 0 | ✅ |
| contexto (críticos abiertos) | 200 | 3 224 ms | 3 747 ms | 188 | 0 | 0 | ✅ |
| red (puertos abiertos) | 200 | 6 692 ms | 7 151 ms | 220 | 0 | 0 | ✅ |
| seguimiento («¿qué hago primero?») | 200 | 3 485 ms | 4 923 ms | 679 | 0 | 0 | ✅ |

**Métricas agregadas:** 7/7 turnos streamed · **TTFT p50 = 3 934 ms** (máx 9 205 ms) · **0 citas validadas** · `unverifiedCount` total 2 · **0 eventos `error`**.

### Resultado por criterio

| Criterio de campo | Objetivo | Medido | Veredicto |
|---|---|---|---|
| Streaming SSE en producción | `chunk`+`done` en todos los turnos | 7/7 con `done`, 0 `error` | ✅ |
| TTFT p50 de turnos streamed | ≤ 1 500 ms | **3 934 ms** | ❌ (+2 434 ms) |
| ≥1 cita real por respuesta muestreada con hallazgos | ≥1 en cada una | **0** (0/7) | ⚠️ **no medible con esta cuenta** |
| `unverifiedCount == 0` en respuestas citadas | 0 | 2 turnos con 1 → el gate **rechazó** la cita no validada | ✅ (gate) / ❌ (grounding) |
| `app_logs` `chat.citation.unverified` 24 h | 0 nuevos o justificados | **2** (ambos generados por esta misma sesión; 3 en 7 d) | ⚠️ |
| Muestra n ≥ 20 turnos | ≥ 20 | **7** | ❌ insuficiente |

**Limitación de la muestra (cita):** el único proyecto de la cuenta de smoke no tiene hallazgos (`intelligence_findings` = 0 para ese `project_id`); la BD tiene **151 hallazgos** pero pertenecen a proyectos del owner (`Juan Palacios WebSite` 21, `Consultora BPOMA` 12, `Geopark` 6), no accesibles con `TEST_AUTH_*`. Por tanto el criterio de citas reales **no se pudo ejercitar**: los 2 `unverifiedCount=1` son el comportamiento correcto del servidor descartando una cita que no puede validar contra hallazgos del tenant, no una cita falsa mostrada al usuario.

### Conclusión de la sesión

- **Streaming:** verificado en producción (7/7 turnos, sin `error`, cierre `done` correcto).
- **Latencia:** el objetivo de TTFT (≤1,5 s) **no se cumple** con p50 3,9 s; se registra como gap de producto, no como regresión de gates (el plan no fijaba TTFT como gate bloqueante de CI).
- **Citas:** no evaluable sin una cuenta con hallazgos; requiere sesión con credenciales del owner o un proyecto de prueba con hallazgos sembrados.
- **Cierre REQ-CHAT-SPRINT2:** **SE MANTIENE ABIERTO**. Muestra n=7 < 20 y criterio de citas sin evidencia. Re-evaluación a T+7d (2026-11-04) con cuenta que tenga hallazgos, o cuando el owner aporte el proyecto de prueba.

