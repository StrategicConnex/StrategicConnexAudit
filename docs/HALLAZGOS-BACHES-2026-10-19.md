# Baches del proyecto — hallazgos con evidencia

**Fecha:** 2026-10-19 · **Commit:** `7449efb` (árbol limpio salvo este documento y el análisis del mismo día)
**Método:** lectura de código y grep dirigido sobre los caminos de escritura, autorización y ejecución en background. No se ejecutaron suites (no hubo cambios de código); las cifras de gates vienen del análisis [ANALISIS-PROYECTO-2026-10-19.md](ANALISIS-PROYECTO-2026-10-19.md).

> Este documento lista **baches verificables**, no deuda genérica. Cada uno cita archivo y línea. Al final hay una sección de **falsos positivos descartados** tras comprobarlos, para que no se vuelvan a reportar.

## Resumen

| ID | Severidad | Área | Hallazgo |
|---|---|---|---|
| B-01 | **Alta** | API | `POST /api/bulk-scan` duplica investigaciones y deja una huérfana en `running` por target |
| B-02 | **Alta** | API | `POST /api/intelligence/bulk` responde 202 "queued" pero nada drena esas filas |
| B-03 | **Alta** | Serverless | El escaneo de la API pública es un `promise` sin `after()`/`waitUntil()`: se puede perder |
| B-04 | Media | Serverless | `last_used_at` y el log de uso de API keys se pierden por el mismo patrón |
| B-05 | Alta | Dependencias | Next.js 16.3.3 con advisory crítico (existe parche ≥16.3.8) |
| B-06 | Media | IA | OpenRouter-only sin failover externo: caída total de IA si el proveedor falla |
| B-07 | Media | Privacidad | `X-Robots-Tag: index, follow` global; `/p/[token]` y `/dashboard` sin `noindex` |
| B-08 | Baja | Errores | `listApiKeys`/`revokeApiKey` se tragan errores de BD; auth caída responde 401 |
| B-09 | Media | Verificación | E2E con `retries: 2` en CI y fuera del gate principal |
| B-10 | Media | Base de datos | TD-19: la migración desde cero no se valida en CI |
| B-11 | Baja | Robustez | 12 `catch {}` vacíos; 4 en caminos donde el fallo queda invisible |
| B-12 | Baja | Higiene | `nuevo/` suelto, `.kilo/worktrees` (81 MB) y `.git-archivo-2026-10-02/` en la raíz |
| B-13 | Baja | Documentación | `SYSTEM-MAP`/`PROJECT-INVENTORY` congelados en `2ccda08`; dos árboles de ADR |

---

## B-01 — `/api/bulk-scan` duplica investigaciones y deja huérfanas

**Severidad:** Alta (corrupción de datos + trabajo duplicado)

**Evidencia**

- `src/app/api/bulk-scan/route.ts:72-81` inserta una investigación `status: "running"` por target.
- `:91-106` hace un `fetch` **sin `await`** a `/api/intelligence`, reenviando la `Cookie` y el `Authorization` del usuario.
- `src/app/api/intelligence/route.ts:219` **vuelve a insertar** una investigación nueva para el mismo target. No recibe el id de la placeholder ni la actualiza.

**Impacto**

- Cada target produce **2 filas**: una placeholder que nunca sale de `running` y la real que ejecuta el escaneo.
- Si el self-fetch falla (lambda congelada, cookie caducada, 429 del rate limit interno), quedan **0 escaneos y 1 fila zombi**; el usuario ve 200 "N escaneos en cola con éxito".
- El self-fetch HTTP consume una invocación extra y reenvía credenciales por la red interna.
- El test (`route.test.ts`) mockea `fetch`, por eso no detecta la duplicación.

**Arreglo propuesto**

Extraer la ejecución a una función de servicio y llamarla desde ambas rutas (sin HTTP interno), o encolar en `scan_queue` (`FEATURE_SCAN_QUEUE`) y no crear placeholder. Si se mantiene el placeholder, `await` del trabajo y actualizar **la misma** fila al terminar.

---

## B-02 — `/api/intelligence/bulk` encola filas que nadie procesa

**Severidad:** Alta (endpoint que miente)

**Evidencia**

- `src/app/api/intelligence/bulk/route.ts:88-99`: inserta `status: "queued"` con el comentario *"aquí se despacharía el Trigger a 'audit.trigger.ts'…"*.
- Búsqueda de consumidores: `queued` solo aparece en esa ruta y sus tests. El productor real (`enqueueScanJob`) se usa únicamente en `src/app/api/intelligence/runs/route.ts:147`, y escribe en otra tabla (`scan_queue`), no en `intelligence_investigations`.
- La ruta devuelve `202 { message: "N investigations queued for processing" }`.

**Impacto**

- Las filas quedan en `queued` para siempre: no hay worker, cron ni reaper que las tome.
- Es una ruta huérfana (0 referencias en UI, ya señalada en la auditoría 2026-10-11) que además promete un procesamiento inexistente.

**Arreglo propuesto**

O encolar de verdad (Trigger.dev/`scan_queue` con `investigationId`), o retirar la ruta. Mientras no haya worker, devolver `501 Not Implemented` es más honesto que `202`.

---

## B-03 — Escaneo de la API pública sin garantía de ejecución

**Severidad:** Alta (fila `running` eterna)

**Evidencia**

- `src/app/api/public/v1/intelligence/route.ts:145-152` crea la investigación `running`.
- `:156-158` llama `scanInBackground(...)` **sin `await`** y responde `200 "Scan started"`.
- No existe ningún `after()` ni `waitUntil()` en `src/` (`grep -rnE "\b(waitUntil|after)\s*\(" src` → 0 resultados).
- `scanInBackground` ejecuta 21 herramientas y actualiza la fila a `completed`/`failed`; si la instancia se congela tras la respuesta, esa actualización no ocurre.

**Impacto**

- En Vercel el trabajo posterior a la respuesta no está garantizado: el escaneo puede no ejecutarse nunca y la investigación queda `running` indefinidamente.
- No hay reaper de investigaciones `running` antiguas (la task de limpieza solo purga logs: `src/trigger/cleanup.trigger.ts`).

**Arreglo propuesto**

Usar `after()` de `next/server` (o `tasks.trigger` de Trigger.dev, que ya es dependencia) para el trabajo posterior a la respuesta, y añadir un reaper `running > 15 min → failed` en el dispatcher diario.

---

## B-04 — Pérdida silenciosa de telemetría de API keys

**Severidad:** Media

**Evidencia**

- `src/shared/lib/api-keys.ts:106-109`: `directDb.update(...).set({ lastUsedAt })` sin `await` (`.catch(() => {})`).
- `src/server/api/public-router.ts:139-157`: `directDb.insert(securityAuditLogs)` sin `await`.

**Impacto**

- `/api/api-keys/:id/usage` y la columna "último uso" subcuentan o quedan en cero.
- Ante una key robada, el rastro de uso (IP, user-agent, path) puede faltar justo en las peticiones que importan.

**Arreglo propuesto**

Mismo patrón que B-03: `after()` o `waitUntil`, o `await` antes de responder (el coste es una escritura).

---

## B-05 — Next.js 16.3.3 con advisory crítico

**Severidad:** Alta (cadena de suministro)

**Evidencia**

- `package.json`: `"next": "16.3.3"`, `"eslint-config-next": "16.3.3"`.
- `pnpm audit --prod` (medición del análisis de hoy): **1 crítica + 10 altas + 10 moderadas + 4 bajas**. La crítica es RCE en `next/og`; la app no usa `next/og`, pero el framework está afectado, y hay SSRF alto en Image Optimization.
- La versión parcheada es **≥16.3.8**.

**Impacto**

- Superficie de ataque conocida y parche disponible; el resto de altas vienen de `axios` vía `swagger-ui-react` (solo en `/docs/api`) y de `sharp`/`source-map-js` como transitivas.

**Arreglo propuesto**

Subir `next` y `eslint-config-next` a ≥16.3.8, regenerar lockfile y correr `typecheck` + `test` + `build`. Programar `pnpm audit --prod` como gate (hoy no lo es).

---

## B-06 — OpenRouter-only: un solo punto de fallo de IA

**Severidad:** Media (riesgo aceptado, pero conviene medirlo)

**Evidencia**

- `src/shared/config/env-secrets.ts:42` y `src/server/ai/ai-router.ts:657`: el failover Anthropic (P2-1) se eliminó el 2026-10-18 junto con `providers.ts`.
- `src/server/ai/ai-cost.ts:4` documenta el pool OpenRouter-only.
- Estado real medido en [../tests/integration/AI-CONNECTIONS-REPORT.md](../tests/integration/AI-CONNECTIONS-REPORT.md): OpenRouter **operativo** el 2026-10-18 (4/5 cadenas con datos reales). El "0 de 5" del 17 fue un bloqueo DNS de la red del sitio (`openrouter.ai → 127.9.9.9`), ya resuelto; **no** es un fallo actual del código.

**Impacto**

- Si OpenRouter cae, copilot, reportes, triage y alertas narradas degradan sin failover externo. El trade-off está aceptado y documentado, pero no hay alerta proactiva: el producto se enteraría por el usuario.
- Una sola `OPENROUTER_API_KEY` sin rotación ni segunda clave.

**Arreglo propuesto**

Mantener OpenRouter-only si se acepta el riesgo, pero añadir (a) health check proactivo con alerta cuando la tasa de éxito de `ai_usage` caiga, y (b) mensaje de degradación explícito en UI. Restaurar failover exige código, no solo una env var.

---

## B-07 — `noindex` ausente donde importa

**Severidad:** Media (privacidad)

**Evidencia**

- `next.config.ts:31-44`: `X-Robots-Tag: index, follow` para **todas** las rutas (`source: "/(.*)"`).
- No existe `public/robots.txt` ni `src/app/robots.ts` (verificado por glob).
- `/p/[token]` es el portal cliente con token firmado (`src/app/p/[token]/page.tsx:38-48`); no declara `robots: { index: false }` ni cabecera `noindex`.

**Impacto**

- Un enlace de portal filtrado (referer, logs de proxy, historial compartido) puede acabar indexado; el token sigue siendo la autorización, pero la URL y el nombre del cliente quedarían públicos.
- `/dashboard*` y `/api/*` también anuncian `index, follow`, aunque requieran sesión.

**Arreglo propuesto**

Cabecera `X-Robots-Tag: noindex, nofollow` para `/p/:path*`, `/dashboard/:path*`, `/login`, `/api/:path*`; y `robots.ts` con `Disallow` para esas rutas. Mantener `index, follow` solo en marketing/docs.

---

## B-08 — Errores de BD convertidos en estados de negocio

**Severidad:** Baja

**Evidencia**

- `src/shared/lib/api-keys.ts:164` (`listApiKeys`): `catch { return []; }`.
- `:175` (`revokeApiKey`): `catch { return false; }`.
- `src/shared/lib/api-keys.ts:122` devuelve `authenticated: false, error: "Internal auth error"` y `public-router.ts:96` lo traduce a **401**.

**Impacto**

- Durante una caída de Postgres la UI muestra "no tienes API keys" en vez de un error; revocar una clave puede parecer "no encontrada".
- Un outage se diagnostica como "clave inválida" (401), lo que induce a rotar claves en lugar de mirar la BD.

**Arreglo propuesto**

Propagar el error y mapear a `503` en el router público; en la UI distinguir lista vacía de fallo de carga.

---

## B-09 — El verde de E2E puede ocultar flakes

**Severidad:** Media (calidad de la señal)

**Evidencia**

- `playwright.config.ts:7`: `retries: process.env.CI ? 2 : 0`.
- El análisis de hoy confirma que el gate principal es `typecheck + lint + test + build`; E2E no forma parte de él.

**Impacto**

- Un test puede fallar dos veces y aun así dar verde; combinado con que no está en el gate, la UI no está realmente verificada en cada push.
- Retries es razonable para infra flaky, pero debería ir acompañado de un reporte de reintentos (o `failOnFlakyTests`) para no normalizarlos.

**Arreglo propuesto**

`failOnFlakyTests: true` (o umbral de reintentos en CI) y publicar el conteo de flaky por corrida.

---

## B-10 — La migración desde cero sigue sin validarse (TD-19)

**Severidad:** Media

**Evidencia**

- 64 migraciones con journal coherente, pero el gate no ejecuta `drizzle-kit migrate` sobre un Postgres limpio.
- La suite que lo cubriría (`test:integration`) necesita Postgres y no corre en el job principal; en local falla por `ECONNREFUSED`.

**Impacto**

- Un `DROP`/`ALTER` que dependa del estado previo puede romper un entorno nuevo sin que CI lo detecte. El guard CASCADE-DROP cubre policies, no el orden de migraciones.

**Arreglo propuesto**

Job de CI con Postgres efímero: `db:migrate` desde cero + `db:drift-check` + `test:integration`. Es el cierre real de TD-19.

---

## B-11 — `catch {}` vacíos

**Severidad:** Baja (revisar caso a caso)

**Evidencia:** 12 coincidencias en `src/`. Las que importan:

- `src/app/api/public/v1/intelligence/route.ts:244`: si falla el `update` a `failed` dentro del `catch` del escaneo, el error se pierde y la fila queda `running`.
- `src/app/api/reports/pdf/progress/route.ts:104,116`: el polling se queda mudo.
- `src/components/*/PdfProgress*`: el fallo de red no se comunica.

Las de `network-executors.ts` (4) son fallbacks deliberados de TCP → HTTP y están justificadas.

**Arreglo propuesto**

Sustituir los cuatro primeros por `logger.warn` con contexto; dejar los de red con un comentario que explique por qué el silencio es correcto.

---

## B-12 — Higiene del workspace

**Severidad:** Baja (no afecta runtime)

- `../nuevo/src/app/disclaimer/accept.ts`: un archivo suelto fuera del repo, resto de una copia.
- `../.kilo/worktrees/artistic-seed`: **81 MB** con una copia completa del proyecto; aparece en búsquedas y referencias cruzadas.
- `../.git-archivo-2026-10-02/`, `../auditoria-2026-10-11/`: artefactos de sesiones anteriores en la raíz.

**Impacto:** ruido en greps, riesgo de editar la copia equivocada y de que una auditoría cuente archivos duplicados.

**Arreglo propuesto:** mover a una carpeta de archivo fuera del workspace o borrar (con confirmación).

---

## B-13 — Documentación congelada y ADR duplicados

**Severidad:** Baja

- `docs/architecture/SYSTEM-MAP.md:157,321,336` y `PROJECT-INVENTORY.md:108,122,168,249` declaran **58 tablas, 22 migraciones, 611 tests, 65 archivos** y citan el commit `2ccda08` (2026-08-08). Hoy: **78 tablas** (`pgTable(`), **64 migraciones** (`drizzle/*.sql`) y **2 764 tests en 285 archivos** según la corrida de `vitest` (en git hay 291 archivos `*.test.*`: los 6 restantes son e2e/integration fuera del gate).
- `docs/architecture/ENTERPRISE-ARCHITECTURE.md:117` sigue diciendo "42 rutas" (hoy 77).
- `docs/adr/ADR-004-AMEND-supabase-realtime.md` y `docs/architecture/ADR/ADR-004-AMEND-supabase-realtime.md` coexisten con contenidos distintos (225 vs 385 líneas).

**Impacto:** una auditoría futura que confíe en estos documentos obtiene una foto falsa del sistema; es peor que no tener documentación porque parece verificada.

**Arreglo propuesto:** un script `docs:inventory` que regenere los conteos desde `pgTable(`, `drizzle/*.sql` y `vitest`, y unificar los ADR en un solo árbol.

---

## Falsos positivos descartados (comprobados)

| Sospecha | Resultado |
|---|---|
| SSRF en `network.ping` (usa `tcpPing` sin guardia) | **Descartado**: `network-executors.ts:142` llama `assertPublicHostname(host)` antes del socket |
| XSS por SVG de Mermaid | **Descartado**: `MermaidBlock.tsx:34` fija `securityLevel: 'strict'` y hay test que lo exige |
| Path traversal en `/docs/[...slug]` | **Descartado**: `resolve-file-path.ts` valida segmentos y contención con `path.resolve` |
| Cron abierto en producción | **Descartado**: `src/server/auth/cron.ts` es fail-closed sin `CRON_SECRET` y timing-safe |
| El disclaimer bloquea la API pública | **Descartado**: `/api` está en `PUBLIC_PATHS` (`disclaimer.ts:29-38`) |
| `directDb` en la API pública sin autorización | **Descartado**: cada handler llama `assertProjectAccess` + scope de la key |
| La IA está caída | **Descartado**: el "0 de 5" era DNS de la red el 2026-10-17; el 2026-10-18 OpenRouter respondió en 4/5 cadenas |

---

## Orden recomendado

1. **B-01 y B-02** — son datos incorrectos que ya se están escribiendo; el arreglo es acotado.
2. **B-03 y B-04** — `after()`/`waitUntil` + reaper; sin esto, el trabajo asíncrono no es fiable.
3. **B-05** — actualizar Next y añadir `audit` al gate.
4. **B-07, B-09, B-10** — privacidad, señal de tests y migración desde cero.
5. El resto es higiene y documentación.

### ✅ B-06 RESUELTO (2026-10-19): failover inter-proveedor implementado

El trade-off "OpenRouter-only" que este bache documentaba fue reemplazado por decisión
del owner la misma tarde del análisis: **failover Groq → Gemini integrado al pool**
(ver `src/server/ai/ai-router.ts` — `FALLBACK_PROVIDERS`, y la addenda de
[tests/integration/AI-CONNECTIONS-REPORT.md](../tests/integration/AI-CONNECTIONS-REPORT.md)).
Claves ambas opcionales, verificadas en vivo (chat/json_object/tools), circuit breaker
por proveedor y probes en el healthcheck IA. El (a) de "health check proactivo" ya
existía (healthcheck IA con guard env-parity + SIEM) y ahora incluye el failover; el
(b) del "mensaje de degradación explícito en UI" también se cerró: el chat ya no
disfrazaba fallos transitorios del pool como "configura tu API key".
