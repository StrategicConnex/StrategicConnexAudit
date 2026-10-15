# P2-13 — Plan de implementación: rate limit fail-closed con fallback acotado

**2026-10-15 · estado: PLAN, sin ejecutar.** Diseño aprobado en
[spec](../specs/2026-10-15-p2-13-rate-limit-fail-closed-design.md) (`70f07c2`).
Cierra SA-04 de `auditoria-2026-10-11/01-seguridad.md`.

Punto de cambio: el `catch` de `checkRateLimitPostgres`
([ratelimit.ts:315-327](../../../src/shared/lib/ratelimit.ts)) deja de devolver
`success: true` y pasa a degradar a memoria acotada.

---

## 1. Criterios de aceptación (del spec §7, verificables)

| # | Criterio | Se verifica con |
|---|---|---|
| 1 | Store caído → el identificador que agota su límite recibe `429` igual | L2 test 1 |
| 2 | Superado el techo global por instancia → `429` con identificador nuevo | L2 test 2 |
| 3 | Un identificador ya bloqueado NO consume techo global (anti-DoS) | L2 test 3 |
| 4 | Durante el cooldown no se invoca Postgres | L2 test 4 |
| 5 | Al recuperarse el store se vuelve al camino distribuido y se loguea | L2 test 5 |
| 6 | `logSecurityEvent("rate_limit_degraded", …)` una vez por entrada | L2 test 6 |
| 7 | `RATE_LIMIT_STORE=memory` no toca estado de degradación ni techo | L2 test 7 |
| 8 | Headers de rate limit sin cambios de forma ni significado | L2 test 8 + revisión |
| 9 | ADR-002 con enmienda §16 | L3 |
| 10 | `typecheck` · tests afectados · `lint` · `prettier` en verde | L5 |

## 2. Lotes

### L1 — Código: estado de degradación y fallback (`src/shared/lib/ratelimit.ts`)

1. Constantes y estado de módulo, junto a `memoryWindows`:
   - `DEGRADED_COOLDOWN_MS` ← `RATE_LIMIT_DEGRADED_COOLDOWN_MS` (default `15000`)
   - `FALLBACK_GLOBAL_LIMIT` ← `RATE_LIMIT_FALLBACK_GLOBAL_LIMIT` (default `600`)
   - `FALLBACK_GLOBAL_WINDOW_MS = 60_000` (fijo, independiente de `config.window`)
   - `degradedUntil`, `consecutiveFailures`, `lastDegradedEventAt`,
     `fallbackGlobalHits: number[]`
2. `fallbackCeilingExceeded(now)`: poda la ventana global, devuelve si superó el techo.
3. `checkFallback(identifier, config)`: orden **exacto** del spec §3.2 —
   primero `checkRateLimitInMemory`, si el identificador ya está bloqueado
   devuelve su `429` **sin consumir** techo global; si pasa, incrementa el
   contador global y sólo entonces evalúa el techo.
4. `enterDegraded(error, config)`: fija `degradedUntil = now + cooldown`,
   incrementa `consecutiveFailures`, `logger.warn` y `logSecurityEvent` con dedupe
   por entrada (`lastDegradedEventAt`).
5. `exitDegraded(now)`: limpia estado y `logger.info` con la duración.
6. `checkRateLimitPostgres`: en la cabecera, si `now < degradedUntil` →
   `checkFallback` sin llamar a Postgres; en el `catch` → `enterDegraded` +
   `checkFallback`; en el camino feliz, si veníamos degradados → `exitDegraded`.
7. Export `resetRateLimitDegradation()` **solo para tests** (precedente:
   `resetAllCircuits()` en `circuit-breaker.ts`).
8. Actualizar los comentarios del archivo que hoy afirman fail-open
   (cabecera del bloque de stores, docstring de `checkRateLimitPostgres` y
   `checkRateLimitInternal`): pasan a describir la degradación.

**Verificación L1:** `pnpm typecheck`.

### L2 — Tests (`src/shared/lib/ratelimit-store.test.ts`)

1. Añadir al mock existente: `logSecurityEvent` desde `./audit-log`
   (`vi.mock("./audit-log", () => ({ logSecurityEvent: securityEventMock }))`).
2. `beforeEach`: `resetRateLimitDegradation()` y reset de los mocks — el estado es
   de módulo y sobrevive entre tests del mismo archivo.
3. **Sustituir** el test `"fail-open: el store caído devuelve allowed=true y
   loguea el error"` por los casos 1–7. Motivo (declarado en el spec §4): asserta
   literalmente el comportamiento que este cambio elimina; no se debilita
   cobertura, se refuerza (limitación efectiva + techo + dedupe).
4. Caso 8: los headers del `429` del fallback llevan `RateLimit-Limit` con el
   límite **configurado** y `Retry-After` presente.
5. Actualizar el comentario de cabecera del archivo (documenta el fail-open).

**Verificación L2:** `npx vitest run src/shared/lib/ratelimit-store.test.ts src/shared/lib/ratelimit.test.ts src/shared/lib/ratelimit-ip.test.ts`.

### L3 — ADR-002

Añadir **§16** con el texto del spec §3.6 (fail-closed con fallback acotado, sólo
para el rate limit; §14 intacta para caché y circuit breaker).

**Verificación L3:** `node scripts/quality-gate.mjs docs/architecture/ADR/ADR-002-fail-open-rate-limit.md --min 80` (el propio ADR documenta ese gate).

### L4 — Documentación que quedaría falsa

Actualizar sólo las frases que afirman fail-open **del rate limit** (el término
genérico sigue siendo válido para caché y circuit breaker):

| Archivo | Qué decir ahora |
|---|---|
| `docs/architecture/SYSTEM-MAP.md` (~131, 296, 310, 409) | rate limit degrada a memoria acotada; circuit breaker sigue fail-open |
| `docs/architecture/PROJECT-INVENTORY.md` (~153) | ídem |
| `docs/architecture/ENTERPRISE-ARCHITECTURE.md` (~35, 396, 518, 553) | ídem (+ riesgo R1 matizado: ya no es «permite todo») |
| `docs/traceability/TRACEABILITY-MATRIX.md` (~42, 58) | REQ-106 pasa a describir la degradación acotada |
| `docs/testing/TEST-COVERAGE-MATRIX.md` (~156) | 429 con store caído ya no es «fail-open» |
| `docs/database/PRODUCTION-PUSH-FINAL-VALIDATION.md` (~498) | ídem |

**Verificación L4:** grep sin resultados de `fail-open` aplicado al rate limit en
esos archivos.

### L5 — Verificación final

```
pnpm typecheck
npx vitest run src/shared/lib/ratelimit-store.test.ts src/shared/lib/ratelimit.test.ts src/shared/lib/ratelimit-ip.test.ts
pnpm lint
npx prettier --check src/shared/lib/ratelimit.ts src/shared/lib/ratelimit-store.test.ts
```

## 3. Cómo se ejercita el camino degradado (honestidad de verificación)

El fallback **no se puede provocar en producción** sin tumbar el store. Se
verifica así, en este orden:

1. **Unitario (definitivo)**: el mock de `@/shared/db` que ya existe hace fallar
   `execute` de forma determinista → cubre criterios 1–7 sin infraestructura.
2. **Local (no regresión)**: `pnpm dev` con `RATE_LIMIT_STORE=memory` — el camino
   sin Postgres debe comportarse exactamente como hoy.
3. **Local (degradación real, opcional)**: `RATE_LIMIT_STORE=postgres` con un
   `DIRECT_URL` apuntando a un puerto cerrado (`127.0.0.1:1`) y ejercitar
   `validate-email` con `curl`: debe limitar con la ventana en memoria y dejar el
   evento `rate_limit_degraded` en el log. No se ejecuta contra producción.

Queda sin verificar en este plan: el comportamiento bajo **varias instancias
serverless simultáneas** (el techo es por instancia, por diseño).

## 4. Rollback

- Inmediato y sin desplegar: `RATE_LIMIT_STORE=memory` (override de emergencia ya
  existente) o `RATE_LIMIT_DEGRADED_COOLDOWN_MS=0` +
  `RATE_LIMIT_FALLBACK_GLOBAL_LIMIT` muy alto para volver, en la práctica, al
  comportamiento permisivo anterior.
- Total: revert del commit de implementación (el spec y el plan quedan como
  documentación del porqué).

## 5. Riesgos abiertos y decisiones aplazadas

- **Límite por instancia durante el outage**: aceptado en el spec §5; el techo
  acota por instancia, no globalmente.
- **Alerta sin destinatario**: el evento llega al SIEM, pero nadie gatea aún
  sobre `rate_limit_degraded`. Candidato a runbook/alerta en P2-15 o al
  dispatcher diario (mismo patrón que el chequeo del cron de P2-14).
- **Fuera de alcance**: health público que revela `ok/degraded`, SA-05 (spoofing
  de IP), circuit breaker y caché.
