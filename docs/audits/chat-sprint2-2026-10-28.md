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

