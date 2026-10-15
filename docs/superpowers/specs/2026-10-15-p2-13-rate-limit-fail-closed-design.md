# P2-13 — Rate limit fail-closed con fallback acotado (SA-04)

**Fecha:** 2026-10-15 · **Estado:** diseño aprobado, pendiente de plan de implementación
**Hallazgo:** `auditoria-2026-10-11/01-seguridad.md` §SA-04 · **Código:** `src/shared/lib/ratelimit.ts:315-327`
**Decisión afectada:** [ADR-002](../../architecture/ADR/ADR-002-fail-open-rate-limit.md) (fail-open)

---

## 1. Problema

`checkRateLimitPostgres` envuelve el upsert en un `try/catch` y, ante CUALQUIER
error del store, devuelve `success: true` con el presupuesto completo:

```ts
} catch (error) {
  logger.error(`[rate-limit:postgres] Store no disponible para "${config.prefix}" — fail-open (ADR-002):`, error);
  return { success: true, limit: config.limit, remaining: config.limit, reset: now + windowMs, retryAfter: 0 };
}
```

Consecuencia medida: si Postgres falla, **el límite desaparece por completo** en
`validate-email` (`email_limit`, 40/60 s por IP) y en el callback de auth
(`callback_limit`, 10/60 s por IP) — que son el **único** control anti fuerza
bruta de esos flujos. El resto de prefijos (`ai_limit`, `intel_scan`, cuotas
diarias) pierden su única defensa de frecuencia.

El fail-open es una decisión **deliberada** de ADR-002 (evitar 429 masivos ante
la caída de un servicio auxiliar), no un descuido. Este spec **la modifica**, no
la ignora: la sustituye por una degradación que sigue limitando.

## 2. Decisión

Ante error del store Postgres, el limitador **degrada a memoria acotada** en
lugar de permitir todo:

1. El cálculo pasa al sliding window en memoria del propio proceso
   (`checkRateLimitInMemory`, que ya existe y se usa en dev/test).
2. Se mantiene **el mismo límite y la misma ventana** por identificador, para no
   bloquear tráfico legítimo con umbrales sorpresa durante un outage.
3. Se añade un **techo global por instancia** que acota el abuso total durante la
   degradación (compensa que cada instancia tenga su propio presupuesto).
4. La degradación se **señala** (log + evento de seguridad) una vez por entrada.

## 3. Diseño

### 3.1 Estado de degradación (por proceso)

Estado de módulo en `ratelimit.ts`, junto a `memoryWindows` y `pruneScheduled`:

| Campo | Tipo | Significado |
|---|---|---|
| `degradedUntil` | `number` | Epoch ms hasta el que NO se intenta Postgres. `0` = sano. |
| `consecutiveFailures` | `number` | Fallos seguidos del store desde la última respuesta correcta. |
| `lastDegradedEventAt` | `number` | Dedupe del evento de seguridad (una emisión por entrada). |

Configuración por entorno con default en código (mismo patrón que
`RATE_LIMIT_STORE`):

| Variable | Default | Efecto |
|---|---|---|
| `RATE_LIMIT_DEGRADED_COOLDOWN_MS` | `15000` | Ventana de enfriamiento: durante ella no se llama a Postgres y todo se limita en memoria. |
| `RATE_LIMIT_FALLBACK_GLOBAL_LIMIT` | `600` | Máximo de peticiones atendidas en degradado por instancia y por ventana de 60 s. |

### 3.2 Flujo de una petición

```
checkRateLimitInternal(identifier, config)
  └─ store = postgres (producción)
       ├─ now < degradedUntil  → checkFallback(identifier, config)      [sin tocar Postgres]
       └─ intento Postgres
            ├─ OK               → si estábamos degradados: salir del modo + logger.info
            └─ error            → enterDegraded(error, config) + checkFallback(...)
```

`checkFallback(identifier, config)` — **el orden importa**:

1. Delega primero en `checkRateLimitInMemory(identifier, config)` (misma ventana
   y mismo límite que el store distribuido).
2. Si el identificador **ya está bloqueado**, devuelve ese `429` sin tocar el
   contador global. Un atacante machacando un solo identificador no debe poder
   agotar el presupuesto compartido de la instancia y dejar sin servicio al resto
   (amplificación de DoS).
3. Si el identificador pasa, incrementa el contador global de la ventana fija de
   60 s (independiente de `config.window`, a propósito: es un presupuesto de
   proceso, no del identificador).
4. Si el contador global supera `RATE_LIMIT_FALLBACK_GLOBAL_LIMIT` → `429` con
   `retryAfter` hasta el fin de la ventana global. Esto es el *fail-closed
   acotado*: no bloquea a nadie legítimo, pero corta el abuso masivo durante el
   outage. La petición rechazada por el techo ya consumió su propio slot.
5. Si no lo supera, devuelve el resultado del paso 1 con el `limit`
   **configurado** (no el global), de modo que los headers `RateLimit-*` no
   cambian de significado durante la degradación.

### 3.3 Salida del modo degradado

`degradedUntil` expira → se vuelve a intentar Postgres. Si responde:
`degradedUntil = 0`, `consecutiveFailures = 0` y `logger.info` de recuperación
(incluye cuánto duró la degradación). Si vuelve a fallar, se re-entra con una
ventana nueva. No hay half-open ni umbral de éxitos: el flujo natural de
peticiones ya sondea el store.

### 3.4 Observabilidad

| Momento | Emisión |
|---|---|
| Entrada en degradado | `logger.warn` (con `prefix`, `consecutiveFailures`) + `logSecurityEvent("rate_limit_degraded", { prefix, consecutiveFailures, globalLimit, cooldownMs })` |
| Mientras dura | nada por petición (evita inundar logs; el dedupe es por entrada) |
| Salida | `logger.info` con la duración |
| Techo global superado | `logger.warn` + `logSecurityEvent("rate_limit_fallback_ceiling", { globalLimit })`, también deduplicado |

`logSecurityEvent` ya existe (`src/shared/lib/audit-log.ts`) y es el canal de
SIEM del proyecto; no se añade proveedor nuevo (coherente con ADR-007/ADR-009).

### 3.5 Contrato HTTP

Sin cambios: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`,
`X-RateLimit-*` y `Retry-After` siguen emitiéndose igual, con el límite
configurado. Un 429 por techo global es indistinguible para el cliente de un 429
normal (no se filtra el estado interno del limitador).

### 3.6 Enmienda a ADR-002

Nueva sección **§16 de ADR-002** (sustituye la regla de fail-open **sólo para el
rate limit**):

> **§16 (2026-10-15) — Rate limit: fail-closed con fallback acotado.** Un fallo
> del store Postgres deja de permitir todo. El cálculo degrada al sliding window
> en memoria del proceso con el mismo límite configurado, más un techo global por
> instancia que acota el abuso durante el outage; la entrada en degradado se
> registra como evento de seguridad. La caché y el circuit breaker **conservan**
> el fail-open de §14: un fallo de un auxiliar nunca bloquea el trabajo útil, pero
> un control de seguridad no se desactiva solo. Compensación asumida: durante el
> outage el límite es por instancia, no distribuido.

## 4. Testing

`src/shared/lib/ratelimit-store.test.ts` ya mockea `@/shared/db`
(`vi.mock("@/shared/db", () => ({ directDb: { execute: executeMock } }))`) y
`@/lib/logger`, así que el camino de fallo es inyectable sin infraestructura.

**Test que se sustituye (y por qué):** `"fail-open: el store caído devuelve
allowed=true y loguea el error"` asserta *exactamente* el comportamiento que este
cambio elimina. No se debilita: se reemplaza por aserciones más fuertes sobre el
comportamiento nuevo (limitación efectiva + techo + dedupe del evento). Mantener
ambos es imposible por construcción.

Casos nuevos:

1. **Store caído sigue limitando**: con `limit: 5`, tras el fallo, la sexta
   petición del mismo identificador devuelve `success: false` (antes: todas
   `true`).
2. **Techo global**: con `RATE_LIMIT_FALLBACK_GLOBAL_LIMIT=N`, la petición `N+1`
   (identificadores distintos) se rechaza aunque cada identificador tenga
   presupuesto propio.
2b. **El techo no amplifica el DoS**: un identificador que ya está bloqueado por
   su propio límite consume **cero** presupuesto global, así que no puede dejar
   sin servicio a los demás identificadores de esa instancia.
3. **Cooldown**: durante la ventana, `executeMock` **no** vuelve a llamarse
   (una sola invocación tras varios requests).
4. **Salida del modo**: pasado el cooldown y con el mock resolviendo, se vuelve a
   llamar a Postgres y el modo se limpia (verificable por el `logger.info` de
   recuperación y porque el conteo vuelve a ser distribuido).
5. **Evento deduplicado**: `logSecurityEvent` se emite **una** vez por entrada en
   degradado, no una por request (con `logSecurityEvent` mockeado).
6. **`RATE_LIMIT_STORE=memory` intacto**: el camino de memoria no toca el estado
   de degradación ni el techo global.

Además: extender `src/shared/lib/ratelimit.test.ts` sólo si el cambio de
`checkRateLimitInternal` altera su contrato (hoy fuerza `memory`; no debería).

## 5. Riesgos y límites

| Riesgo | Evaluación |
|---|---|
| Durante el cooldown el límite es **por instancia**, no distribuido | Aceptado: con el store caído no puede existir límite distribuido. El techo global acota el daño por instancia; el intervalo (15 s) es corto. |
| El techo global (600/60 s por instancia) puede cortar tráfico legítimo si Postgres cae en hora punta | Mitigado por default generoso y configurable por env sin desplegar. Se documenta en el runbook. |
| Un fallo transitorio mete en degradación 15 s | Es el objetivo: evita castigar un store que se está recuperando con N timeouts. La salida es automática. |
| Falso "verde" en la observabilidad (nadie mira el evento) | Fuera de alcance aquí; el evento queda en `rate_limit_degraded` para el SIEM y puede gatearse en un runbook/alerta posterior. |

## 6. Fuera de alcance (explícito)

- **SA-06 / health público**: `api/public/v1/health` revela `ok`/`degraded` a un
  anónimo. Es otro hallazgo; no se toca aquí para no mezclar cambios.
- **SA-05**: endurecer la identificación de IP (spoofing de `x-forwarded-for`).
  Cambia la semántica de identidad y merece su propio spec.
- **Circuit breaker y caché**: siguen fail-open (§14 de ADR-002 intacta).
- **Limpiar entradas del `Map` en memoria**: el barrido actual (>10 000 claves)
  se mantiene; no se optimiza en este cambio.

## 7. Criterios de aceptación

1. Con el store Postgres fallando, un identificador que agota su límite recibe
   `429` igual que si el store funcionara (verificado por test).
2. Superado el techo global por instancia, se responde `429` aunque el
   identificador sea nuevo (verificado por test).
3. Durante el cooldown no se invoca Postgres (verificado por test con el mock).
4. Al recuperarse el store, el limitador vuelve al camino distribuido y queda
   registrado en el log (verificado por test).
5. `logSecurityEvent("rate_limit_degraded", …)` se emite una vez por entrada
   (verificado por test).
6. Los headers de rate limit no cambian de forma ni de significado.
7. ADR-002 lleva la enmienda §16 y el `RATE_LIMIT_STORE` sigue siendo el override
   de emergencia para volver a `memory`.
8. `pnpm typecheck`, la suite unitaria afectada y `pnpm lint` en verde.
