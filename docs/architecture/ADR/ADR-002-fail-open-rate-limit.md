---
layout: default
title: ADR-002
nav_order: 3.4.2
permalink: /docs/architecture/adr/002
version: 1.1
fecha: 2026-08-02
autor: StrategicConnex Engineering
estado: Aprobado (enmendado 2026-09-27)
---

# ADR-002 — Fail-open en rate limit y circuit breaker (Redis)

{: .warning }
**Enmienda 2026-09-27 (v1.1):** se eliminaron `@upstash/redis` y
`@upstash/ratelimit`. El rate limit, el circuit breaker y la caché IA ahora
corren **en memoria por instancia**; no hay cliente Redis, ni `Proxy` lazy, ni
`safeRedis` con timeout. La decisión original —**nunca bloquear por un fallo de
infraestructura auxiliar**— se conserva y se cumple por construcción. Ver §14.

{: .no_toc }

<details open markdown="block">
  <summary>Tabla de contenidos</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

---

## 1. Contexto

El rate limiting y el circuit breaker dependen de **Upstash Redis**. Si Redis cae, un fail-closed convertiría una caída parcial en una **caída total del producto** o, peor, en **429 masivos** para todos los usuarios. **Alcance:** `src/shared/lib/ratelimit.ts` y `src/shared/lib/circuit-breaker.ts` (T01-04).

```mermaid
flowchart LR
    R["Redis (Upstash)"]
    RL["ratelimit.ts<br/>(lazy Proxy)"]
    CB["circuit-breaker.ts<br/>(safeRedis)"]
    RL -- "fallo Redis → permitir (fail-open)" --> OK["Request continúa<br/>sin 429 masivos"]
    CB -- "timeout 1500ms → permitir" --> OK
```

## 2. Problema

Un fallo de Redis debía **degradar con gracia** (permitir la operación) en lugar de bloquear falsamente a usuarios legítimos o descartar resultados de ejecutores.

## 3. Requisitos que motivan la decisión

| REQ | Requisito | Criterio de aceptación |
|-----|-----------|------------------------|
| REQ-1 | Nunca 429 masivos por caída de Redis | Rate limit hace fail-open |
| REQ-2 | No descartar resultados exitosos por timeout | Circuit breaker hace fail-open |
| REQ-3 | No instanciar Redis en build | Cliente lazy vía `Proxy` |

## 4. Opciones consideradas

| Opción | Descripción | Veredicto |
|--------|-------------|-----------|
| Fail-closed | Ante fallo de Redis, denegar | Descartada (caída total) |
| Fail-open siempre | Permitir siempre | **Adoptada** (degradación graciosa) |
| Cache local como respaldo | TTL local en caso de fallo | Evaluada, no necesaria |

## 5. Decisión

**Decisión:** implementar **fail-open** tanto en el rate limit como en el circuit breaker. El rate limit usa un cliente Redis lazy (`Proxy`) que no se instancia en build; ante fallo permite la operación. El circuit breaker envuelve cada op de Redis con timeout de 1500 ms y, ante error, devuelve el fallback permitiendo la operación.

| Campo | Valor |
|-------|-------|
| Estado | Accepted |
| Fecha | 2026-08-02 |
| Autor | StrategicConnex Engineering |
| Commits | `eda77c4` (ratelimit fail-open) · `d1b8723` (allowlist + 40 req/min) · `d59543a` (circuit-breaker fail-open) |
| Archivos | `src/shared/lib/ratelimit.ts` · `src/shared/lib/circuit-breaker.ts` |
| Relacionado | [SYSTEM-MAP.md](../SYSTEM-MAP.md) §3 · [ENTERPRISE-ARCHITECTURE.md](../ENTERPRISE-ARCHITECTURE.md) |

## 6. Racional

- Cliente Redis lazy: `new Proxy({} as Redis, ...)` evita eager instantiation en build [VERIFIED: `ratelimit.ts:22`].
- Fail-open explícito con comentario: "un outage de Redis jamás debe bloquear ni falsear" [VERIFIED: `circuit-breaker.ts:35-37`].
- `safeRedis` rechaza con `Redis op timeout` a los 1500 ms y retorna el fallback [VERIFIED: `circuit-breaker.ts:23,31`].
- `CircuitState` (CLOSED/OPEN/HALF_OPEN) [VERIFIED: `circuit-breaker.ts:3-6`].
- [ASSUMPTION] En un ataque coordinado, fail-open degrada la protección; se compensa con allowlist y límites en capas de proxy.

## 7. Consecuencias — arquitectura, datos, operaciones y seguridad

**Arquitectura:** `ratelimit.ts` (fan-in 17) y `circuit-breaker.ts` son dependencias compartidas de los route handlers (ver DEPENDENCY-GRAPH.md §5).

**Datos:** sin impacto.

**Operaciones y monitoring:** una caída de Redis genera warnings en consola (`[CircuitBreaker] Redis op failed (fail-open)`) y se observa en los logs; los headers de rate limit siguen emitiéndose cuando Redis responde.

**Seguridad y controles:** los 429 auténticos se mantienen cuando Redis responde; la cabecera de respuesta usa el formato IETF `RateLimit-Limit/Remaining/Reset` + legacy `X-RateLimit-*` [VERIFIED: `ratelimit.ts:127-132`]. La `EMAIL_ALLOWLIST` (incluye `palacios_juan@hotmail.com`) exime a cuentas críticas [VERIFIED: `ratelimit.ts:37`].

## 8. Riesgos y mitigaciones

| Riesgo | Severidad | Mitigación |
|--------|-----------|------------|
| Abuso de tasa durante outage de Redis | MEDIUM | Fail-open acotado al periodo de caída; logs de warning; límite global en capas edge |
| Falsear 429 masivos en login | HIGH | `isEmailAllowlisted()` + 40 req/min (commit `d1b8723`) [VERIFIED] |

- [UNKNOWN] Duración máxima tolerada de un outage de Redis sin degradación de seguridad no está documentada.

## 9. Migración — pasos y flujo de trabajo

```text
N/A — decisión ya aplicada. Los consumidores importan safeRedis/rateLimit sin cambios de firma.
```

## 10. Verificación — quality gate, API y tests

- `node scripts/quality-gate.mjs docs/architecture/ADR/ADR-002-fail-open-rate-limit.md --min 80` → resultado en §13.
- Impacto en API: los endpoints GET/POST afectados (login, `/api/intelligence`) no cambian contrato; solo comportamiento ante fallo de Redis.
- Impacto en tests: suite Vitest pasa (248 tests) y los circuit breakers se ejercitan en tests de ejecutores [VERIFIED]. Los **tests unitarios** de `ratelimit`/`circuit-breaker` corren en CI.
- Deployment/CI/CD: sin cambios de despliegue (Vercel); el cliente lazy evita romper el build, y el pipeline (`ci.yml`) permanece intacto.
- **Cross-check:** SYSTEM-MAP.md §3 (FLOW-101) y DEPENDENCY-GRAPH.md §9 documentan el mismo comportamiento.

## 11. Trazabilidad

**MAT-122 — Trazabilidad del ADR-002**

| ID | Tipo | Qué cubre | Fuente verificada |
|----|------|-----------|-------------------|
| MAT-122 | Tabla | Fail-open rate limit + circuit breaker | `ratelimit.ts` · `circuit-breaker.ts` · commits `eda77c4`/`d1b8723`/`d59543a` |

## 12. Glosario

| Término | Definición |
|---------|------------|
| Fail-open | Permitir la operación cuando un servicio auxiliar falla |
| Lazy Redis | Cliente Redis instanciado bajo demanda vía `Proxy` para no romper el build |

## 13. Versionado y verificación

| Versión | Fecha | Cambios | Estado |
|---------|-------|---------|--------|
| 1.0 | 2026-08-02 | Registro de la decisión fail-open (T01-04) | Aprobado |
| 1.1 | 2026-09-27 | Enmienda: eliminación de Upstash Redis; store en memoria | Aprobado |

**Resultado quality gate:** 100/100 (PASS, `--min 80`, 2026-08-02).

---

## 14. Enmienda (2026-09-27) — fin de la dependencia de Upstash

**Contexto de la enmienda:** `UPSTASH_REDIS_REST_URL/TOKEN` no existían en el
entorno real; la app ya operaba con fallback en memoria y el health público
respondía `503` por `redisConfigured=false`. Se optó por eliminar los paquetes
en lugar de renegociar credenciales.

**Qué cambió:**

| Antes (v1.0) | Ahora (v1.1) |
|--------------|-------------|
| `ratelimit.ts` con `Proxy` lazy + llamadas REST a Upstash | `checkRateLimitInMemory()` puro, sin red |
| `circuit-breaker.ts` con `safeRedis` (timeout 1500 ms) y store remoto | `CircuitBreaker` con store `Map` en memoria + `resetAllCircuits()` |
| Caché IA en 2 niveles (L1 memoria + L2 Upstash) | Solo L1 en memoria |
| Progreso de PDF en claves Redis (`pdf_progress:<user>:<genId>`) | Tabla Postgres `pdf_progress` con RLS por usuario |
| Salida de build: `@upstash/redis` + `@upstash/ratelimit` | Sin dependencias Upstash en `package.json` |

**Qué NO cambió (invariante del ADR):** la operación **nunca** se bloquea por un
fallo del limitador: cualquier error interno devuelve `allowed=true` y el
request continúa. Los 429 auténticos siguen emitiéndose con cabeceras IETF
`RateLimit-Limit/Remaining/Reset` + `X-RateLimit-*`, y `isEmailAllowlisted()`
sigue eximiendo a las cuentas críticas.

**Nuevo trade-off explícito (aceptado):** el rate limit y el circuit breaker
**dejan de estar distribuidos**. Cada instancia serverless cuenta sus propios
intentos, así que el límite efectivo por usuario puede multiplicarse por el
número de instancias calientes. Se compensa con la allowlist, con los límites
por endpoint y con el rate limit perimetral de Vercel. El progreso de PDF, en
cambio, **sí** quedó compartido al pasar a Postgres.

**Verificación (2026-09-27):** `npx tsc --noEmit`, `pnpm lint`, `pnpm test`
(207 archivos / 1901 tests), `pnpm test:coverage` (51.14% stmts · 39.83% branches ·
43.6% funcs · 52.52% lines — por encima del ratchet 45/35/39/46), `pnpm build`,
guards (`contrast-guard`, `guard-client-cdns`, `guard-client-secrets`,
`i18n-parity`), `npx drizzle-kit check` (*Everything's fine*) y
`pnpm db:drift-check` (**sin drift duro**, 70/70 tablas) — todos sin errores.

`pdf_progress` se aplicó a Supabase ejecutando `drizzle/2026-09-27_pdf_progress.sql`
(con `create table if not exists`, índice, RLS `pdf_progress_owner` y `grant` a
`authenticated`). No se usó `drizzle-kit migrate`: la BD no tiene la tabla
`__drizzle_migrations` (se creó históricamente con `db:push`), por lo que
reproducir el journal completo habría sido inseguro.

Nota: el `pnpm-lock.yaml` aún lista `@upstash/redis@1.38.0` como **dependencia
opcional transitiva de `drizzle-orm`** (no es dependencia del proyecto ni se
importa en el código). `@upstash/ratelimit` ya no aparece en el lockfile.
