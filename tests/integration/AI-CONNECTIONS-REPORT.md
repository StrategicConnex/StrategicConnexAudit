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
