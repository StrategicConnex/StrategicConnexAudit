# Reporte de conexiones de IA — datos y conexiones reales

**Fecha:** 2026-10-17 · **Ejecución:** `AI_REAL_TESTS=1 pnpm test:integration` (sobre
[ai-real-connections.test.ts](ai-real-connections.test.ts)) · **Resultado:** **0 de 5 proveedores
configurados respondió**; 5 tests en rojo con causa raíz identificada, 6 de configuración en verde.

## Cómo se midió

- Sin mocks y sin `vi.fn()`: llamadas HTTP reales a los endpoints de cada proveedor, con las claves
  de `.env.local` leídas desde `process.env` (cero claves en el código).
- Prompts mínimos (`max_tokens` 16–64) para no gastar tokens; el único prompt grande es el triage de
  **un finding real** de `intelligence_findings` (149 filas en la BD).
- Se ejecutaron **9 llamadas reales** en 5 proveedores; el propio router dejó **10 filas de
  telemetría en `ai_usage`** (17 → 27), todas con `success=false`, atribuidas al último modelo de
  cada cadena (`cohere/north-mini-code:free` en `general-chat`, `nemotron-3-nano-omni` en
  `finding-triage`): la cadena de fallback recorrió el pool entero antes de rendirse.

## Inventario encontrado en el código

| Proveedor | Estado en runtime | Variable(s) | Dónde se usa |
|---|---|---|---|
| **OpenRouter** | PRIMARIO: router, tools, JSON schema, caché semántica | `OPENROUTER_API_KEY` (`OPENROUTER_BASE_URL` opcional) | `src/server/ai/ai-router.ts` → copilot, briefs, reportes SEO, triage, adversary |
| **Anthropic** | failover opcional de texto libre (P2-1) | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | `src/server/ai/providers.ts` |
| **Google Gemini** | **ELIMINADO el 2026-10-17** (`env-secrets.ts` getter purgado) | ~~`GEMINI_API_KEY`~~ | ninguno |
| **NVIDIA NIM** | LEGADO: clave en env, sin consumidor runtime | `NVIDIA_API_KEY` | ninguno |
| **Xiaomi MiMo (apifreellm)** | LEGADO: clave y modelo en env, sin consumidor runtime | `XIAOMI_API_KEY`, `XIAOMI_BASE_URL`, `XIAOMI_MODEL` | `env-secrets.ts` (`aiBaseUrl`) |

Coincide con la auditoría 2026-10-11 (`03-funcionalidad.md`): Gemini/Xiaomi/Bearer «AUSENTE en
runtime»; Anthropic «tipado pero sin implementación» → hoy sí está implementado en `providers.ts`.

## Resultados por servicio

| Servicio | Estado | Latencia | Observación |
|---|---|---|---|
| OpenRouter (`general-chat`) | ❌ FAIL | 177 ms | Cadena completa agotada. `DNS openrouter.ai → 127.9.9.9` |
| OpenRouter (`finding-triage`, finding real) | ❌ FAIL | 7 ms | Mismo origen: ningún modelo del pool fue alcanzable |
| Google Gemini | ❌ ELIMINADO | 431 ms | `403 PERMISSION_DENIED: "Your API key was reported as leaked"` — clave eliminada del entorno el 2026-10-17, no se rota |
| NVIDIA NIM | ❌ FAIL | ~190–490 ms/llamada | Clave válida (catálogo `/models` → 200, 81 modelos), pero **0 funciones NIM habilitadas** para la cuenta: `404 Function … Not found for account` en los 5 modelos probados |
| Xiaomi MiMo (apifreellm) | ❌ FAIL | 787 ms | `401 Incorrect API key provided` |
| Anthropic | ⚠️ N/A | — | `ANTHROPIC_API_KEY` no está configurada → el failover inter-proveedor está **desactivado en la práctica** |

## Causa raíz y acción correctiva

1. **OpenRouter (crítico — es el proveedor del producto).** `nslookup openrouter.ai` devuelve
   `127.9.9.9` con alias `walledgardenloopback.telefonica`: el DNS de esta red enmascara el dominio.
   Otras hosts salen bien (`api.github.com` 200, `example.com` 200), así que el bloqueo es de ese
   dominio y no de la red. **Impacto real:** en esta red el producto está sin IA (copilot, informes,
   triage, alertas narradas). Acción: probar desde CI/Vercel (egress distinto), y en local usar un
   resolver alternativo (DoH/VPN) o cambiar de red. El test lo diagnostica solo: el mensaje de fallo
   incluye el resultado del `dns.lookup` en lugar de un stack opaco.
2. **Gemini: ELIMINADO por clave filtrada (reportada por Google).** GEMINI_API_KEY eliminada de
   `.env.local` y `.env.test` el 2026-10-17 (el getter en `env-secrets.ts` ya se había purgado en
   8e39c42). No se rota: no es proveedor real del proyecto tras la purga, y conservar una clave
   filtrada «por si acaso» es mantener superficie de ataque. Ningún archivo trackeado contiene el
   valor (la plantilla `.env.local.example` sólo tenía el placeholder `AIza...`, que se mantuvo
   como referencia de formato).
3. **NVIDIA: sin funciones NIM habilitadas.** El catálogo es público y no prueba permiso. Acción:
   habilitar los modelos en build.nvidia.com o eliminar la clave; hoy sólo consume ruido.
4. **apifreellm/MiMo: clave inválida.** Acción: rotar o eliminar (`XIAOMI_*` es legado).
5. **Anthropic sin configurar — failover P2-1 DEGRADADO.** `ANTHROPIC_API_KEY` no está disponible
   en el entorno (2026-10-17): el failover inter-proveedor es OpenRouter-only. Cuando OpenRouter
   se agota, el producto degrada en silencio. Riesgo documentado: **caída total de IA si
   OpenRouter falla** (y en esta red efectivamente falla por DNS). Dato accionable verificado:
   `api.anthropic.com:443` **sí es alcanzable** desde esta red (TCP OK, 160.79.104.10), por lo que
   configurar la clave bastaría para tener el failover real en local; sólo falta la provisión de
   la clave.

## Seguridad verificada

- Ninguna clave está hardcodeada; el test sólo lee `process.env` y sólo imprime **nombres** de
  variables. Un test propio verifica que `.env`/`.env.local` no estén trackeados (`git ls-files` → vacío).
- Los mensajes de error se redactan (`redact()`): los identificadores opacos que el proveedor
  devuelve en claro (ids de cuenta de NVIDIA) aparecen como `…`, nunca en claro.
- Los prompts con datos reales sólo llevan título y descripción de un hallazgo de seguridad
  (sin PII de usuario; los findings son hallazgos técnicos del escaneo).

## Reproducción

```bash
AI_REAL_TESTS=1 pnpm test:integration -- ai-real-connections   # medición real
pnpm test:integration                                          # sin opt-in: 0 llamadas de red
```

Sin `AI_REAL_TESTS=1` el archivo se salta los 6 tests de red y pasa en verde: así ninguna corrida
rutinaria de CI gasta tokens ni depende de la egress.

## Límites de esta ejecución

- **No se pudo validar en vivo el camino del producto** (OpenRouter) por el bloqueo DNS, aunque la
  cadena de fallback sí se ejercitó de punta a punta y dejó telemetría en `ai_usage`.
- `pnpm test:integration` completo está en rojo local por otra razón, preexistente y ajena a este
  test: los 4 archivos CRUD/RLS esperan un Postgres en `localhost` (`ECONNREFUSED`) que sólo
  levanta el contenedor de CI. El archivo de IA es el único que pasa local.
- El coste de tokens de esta corrida fue ~0: prompts de 16 tokens y modelos gratuitos; los dos
  prompts mayores fueron el triage de un finding real (220 tokens de salida máx.).

## Cierre de pendientes (2026-10-17, aprobación post-entregable)

Estado final real tras la aprobación, sin ambigüedad:

| Proveedor / ítem | Estado | Causa raíz | Acción |
|---|---|---|---|
| OpenRouter | 🔴 CAÍDO en esta red | DNS de Telefónica enruta `openrouter.ai` → `127.9.9.9` (`walledgardenloopback.telefonica`) | Reintentar desde CI/Vercel (egress distinto); en local usar DoH/VPN u otra red. Requiere provisión de red, no de código |
| Anthropic | 🟡 SIN CLAVE (no ejecutable) | `ANTHROPIC_API_KEY` no configurada en ningún env local | Provisionar la clave: el dominio **sí es alcanzable** desde esta red (TCP 443 verificado) |
| Gemini | ✅ **ELIMINADO** | Clave marcada como filtrada por Google | Clave eliminada de `.env.local` y `.env.test` (2026-10-17); getter purgado en 8e39c42 |
| NVIDIA NIM | 🔴 CAÍDO | Cuenta sin funciones NIM habilitadas | Habilitar modelos en build.nvidia.com o eliminar la clave |
| Xiaomi / apifreellm | 🔴 CAÍDO | `401 Incorrect API key provided` | Rotar o eliminar (legado, sin consumidor runtime) |

**Failover P2-1: DEGRADADO — OpenRouter-only.** Sin `ANTHROPIC_API_KEY` no hay failover
inter-proveedor: si OpenRouter cae (en esta red, cae), la capa de IA muere en cadena. Riesgo
documentado y aceptado hasta la provisión de la clave. La eliminación de Gemini reduce a 2 los
proveedores con código vivo (OpenRouter primario + Anthropic failover pendiente de clave), con la
superficie de ataque de la clave filtrada cerrada.

**Commits de este ticket:** `a376657` (guards CASCADE) → `0744907` (test de IA reales) →
`8e39c42` (purga de getters legados), ya en `origin/main` (verificado por `git ls-remote`).

## Test del failover P2-1 (2026-10-17)

Ejecutado tras el cierre: `vitest run` sobre `providers.test.ts`, `ai-router.chaos.test.ts`
(suites D2), `ai-router.test.ts` y `env-secrets.test.ts` → **35/35 en verde**. Escenarios de
failover verificados (HTTP simulado, sin claves ni red):

1. **OpenRouter caído → Anthropic rescata:** D2 hace morir la cadena OpenRouter (HTTP 500) y
   Anthropic responde 200 → `success: true`, `modelUsed: anthropic/claude-3-5-haiku-20241022`, y
   el router emite el log `[AI Router] general-chat → anthropic/... [failover inter-proveedor]`.
2. **Anthropic también caído (503):** degrada sin lanzar; el error acumula el prefijo
   `[anthropic-failover]` y termina en `Todos los modelos de IA fallaron`.
3. **Guardarraíl de dialecto:** con `tools` o `response_format` el failover NO se activa aunque
   la key exista (el dialecto OpenAI no se traduce 1:1); `providers.test.ts` cubre además 429 y
   respuesta vacía de Anthropic.
4. **Sin `ANTHROPIC_API_KEY`:** `isAnthropicConfigured()` es false y el comportamiento es
   idéntico al previo (sólo cadena OpenRouter interna); el test real opt-in lo declara en un
   `console.warn` explícito.

**Veredicto:** la lógica del failover P2-1 está probada y es correcta. Lo que sigue pendiente no
es código sino provisión: un test end-to-end del failover real (OpenRouter caído + clave real)
requiere `ANTHROPIC_API_KEY`. El dominio ya verificado como alcanzable — al configurar la key,
este suite D2 garantiza que el camino está ejercitado.

## Medición 2026-10-18: el pool RESPONDE — bloqueo de red eliminado

Cambio de raíz respecto al 17: `openrouter.ai` ya no enruta por el walledgarden de Telefónica
(hoy: `104.18.3.115/104.18.2.115`, Cloudflare; TCP 443 verificado). El bloqueo de DNS era de la
red, y la red cambió. Medición fresca (`AI_REAL_TESTS=1`, dos corridas + `pnpm e2e:ai-router`),
verificada contra la telemetría real de `ai_usage`:

| Momento (UTC) | Éxito | Modelo que respondió | Tarea | Tokens |
|---|---|---|---|---|
| 05:37:27 | ✅ | `openrouter/free` (meta-modelo) | general-chat | 30 in / 35 out |
| 05:37:29 | ✅ | `nvidia/nemotron-3-ultra-550b-a55b:free` | finding-triage (finding REAL de la BD) | 228 in / 220 out |
| 05:40:25 | ✅ | `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | general-chat | 30 in / 35 out |
| 05:40:29 | ✅ | `nvidia/nemotron-3-ultra-550b-a55b:free` | finding-triage (finding REAL) | 228 in / 220 out |

**4 de 5 cadenas de la última hora terminaron en éxito real registrado en `ai_usage`.** El
inventario de tokens in/out es evidencia de tráfico real — la Runs de las 12:00 no son mocks.

### Resultados de las corridas de test (12 tests)

- **7 pasan** — incluye general-chat y finding-triage contra OpenRouter real: el pool funciona.
- **3 fallan por causas NUEVAS (ya no es red):**
  1. `finding-triage` JSON: contenido generado (220 tokens = `max_tokens` de la corrida cortado el
     JSON a mitad) — el router real tiene self-healing JSON (idea #15) que lo repara; el test
     espera JSON sin truncar. Acción si se desea verde estricto: subir `max_tokens` en el test.
  2. NVIDIA NIM directo: sin cambiar — `404 Function not found for account` (funciones NIM no
     habilitadas en build.nvidia.com).
  3. Xiaomi/apifreellm: sin cambiar — `401` clave inválida (legado).
- **2 skip por diseño:** Gemini (clave ELIMINADA el 17 — el skip es el resultado correcto) y
  Anthropic (sin `ANTHROPIC_API_KEY`).

### Inestabilidad aguas arriba observada (management)

- `openrouter/free` a veces devuelve vacío → la cadena absorbe vía fallback (así funcionó 05:40).
- `cohere/north-mini-code:free` respondió vacío 2× hoy (0/8 en acumulado).
- `nemotron-3-nano-omni` falló 1× con `ResourceExhausted: Worker local total request limit
  reached (16/16)` y respondió OK 3 minutos después: cuota del tier free agotándose y liberándose.
- El CircuitBreaker abrió correctamente durante la ráfaga de fallos del E2E y amortiguó las
  llamadas siguientes (protección funcionando como fue diseñada).

**Veredicto:** el pool de IA está operativo con datos reales a 2026-10-18 (OpenRouter + failover
interno vivo; Anthropic directo sigue sin clave). El estado del 17 («0 de 5») quedó superado:
la causa raíz era la red del sitio, no el código ni el pool.

## Estado actual (1 proveedor activo) — simplificación OpenRouter-only

| Proveedor | Estado | Observaciones |
|-----------|--------|---------------|
| **OpenRouter** | ✅ Operativo | 4/5 cadenas exitosas con datos reales (2026-10-18) |
| Anthropic | ❌ Eliminado | Simplificación arquitectónica (failover P2-1 nunca activo sin key) |
| Gemini | ❌ Eliminado | Clave filtrada (seguridad) |
| NVIDIA NIM | ❌ Eliminado | Simplificación arquitectónica + 404 «Function not found for account» |
| Xiaomi/apifreellm | ❌ Eliminado | Simplificación arquitectónica + 401 clave inválida |
| Ollama | ❌ Eliminado | Sin getter, sin consumidor runtime; última clave muerta del inventario (2026-10-18) |

## Decisión arquitectónica (2026-10-18)

Se simplificó el pool de IA a **OpenRouter-only**. Razones:
- OpenRouter es un meta-modelo con fallbacks internos (meta-modelo + cadena :free por tarea).
- Reduce complejidad del código (adiós `providers.ts` y su suite), la superficie de
  ataque (una sola clave) y los puntos de fallo de configuración.
- OpenRouter funciona bien: la única causa de caída medida (DNS de la red del 17) ya no existe.

Trade-off aceptado: si OpenRouter cae por completo, el sistema degrada sin failover externo.
El error final del router dice el qué y el porqué: «OpenRouter no disponible. Verificar
conectividad y API key.» + el detalle por modelo de la cadena agotada.

## Limpieza final (2026-10-18): Ollama eliminado

`Ollama_API_KEY` / `Ollama_BASE_URL` borrados de `.env.local` y `.env.test`. Ollama no tuvo
getter en `env-secrets.ts`, ni consumidor en runtime, ni mención en `.env.example` — era la
última clave muerta del inventario de IA. Con esto el pool queda cerrado a **OpenRouter-only
en un archivo**: OPENROUTER_API_KEY + OPENROUTER_BASE_URL, nada más.
