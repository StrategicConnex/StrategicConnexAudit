---
layout: default
title: REQ-002 — Landing Page (/)
nav_order: 8.10
permalink: /docs/performance/req-002-landing-page
version: 2.0
fecha: 2026-10-18
actualizado: 2026-10-30
autor: StrategicConnex Engineering
estado: Abierto — gate v2 (rediseño por TD-25)
---

# REQ-002 — Landing Page (`/`)

> **Nota de alcance (2026-10-19):** el prefijo `REQ-002` de ESTE documento pertenece
> al espacio de nombres de **rendimiento** (`docs/performance/REQ-xxx`, feats de
> optimización). Coincide numéricamente con el `REQ-002` del ROADMAP histórico
> (`docs/improvements/ROADMAP.md`, "Fase 1 — P0 Fundación") pero no es el mismo
> requisito. En auditorías, invalidar por árbol: Rendimiento aquí, Roadmap ahí.

## Requisito

**Gate v2 (rediseño 2026-10-30, motivado por TD-25):** dos gates de naturaleza
distinta, porque en este producto **el tráfico orgánico es ≈0** y un percentil de
campo sin muestra no es una medición: es ruido con formato de dato.

| Gate | Qué mide | Umbral | ¿Cierra REQ-002? |
|------|----------|--------|------------------|
| **G-1 (cierre)** | LCP sintético reproducible, perfil declarado, 3 corridas | p75 < 2 500 ms | ✅ sí |
| **G-2 (corroboración)** | LCP/INP de campo por ruta, sin sesiones sintéticas, dedupe por sesión | p75 < 2 500 ms / < 200 ms con **n ≥ 20 sesiones** por ruta | ❌ no — avala o contradice G-1 |

El TBT se descartó (2026-10-27) porque web-vitals de navegador **no lo reporta**
(es métrica de lab); INP es su sustituto estándar de campo (web.dev). Lighthouse
permanece como referencia de lab, no como gate. El `p75 LCP < 2,5 s` sigue siendo
el umbral; lo que cambia es **de dónde sale la muestra**.

Por qué el gate anterior ("p75 de campo en `web_vitals_logs`") no servía: en 7
días esa tabla acumuló **0 sesiones reales** con LCP en la ruta de entrada
anónima. Sostener un gate rojo sobre eso no era rigor, era un dashboard.

### Anatomía del recorrido anónimo (por qué `/` no es la ruta de entrada)

`src/proxy.ts` aplica el *disclaimer gate* **antes** de todo: sin
`disclaimer_accepted=true`, cualquier ruta no pública responde 307 a
`/disclaimer?redirect=…`. `/login` **no** está en `isDisclaimerPublicPath` (a
propósito), así que el recorrido de un visitante nuevo nunca pinta `/`:

| Paso | Ruta | ¿Pinta? | ¿Emite RUM con LCP? |
|------|------|---------|---------------------|
| 1 | `GET /` sin cookie | no (307 a `/disclaimer`) | no |
| 2 | `GET /disclaimer` | **sí** | sí |
| 3 | `GET /` tras aceptar | no (`redirect("/login")` en `src/app/page.tsx`) | no |
| 4 | `GET /login` | **sí** | **no** — 0 valores de LCP |

Volumen real (7 d al 2026-10-30, dedupe por `(path, session_id)` con `max(lcp)`):

| Ruta | sesiones con LCP | p75 LCP | sesiones con INP | p75 INP | sesiones móvil |
|------|------------------|---------|------------------|---------|----------------|
| `/` | 23 | 5 716 ms | 8 | 408 ms | 4 |
| `/intelligence` | 3 | 3 332 ms | 2 | 48 ms | 0 |
| `/projects/05eb80d6…` | 2 | 5 373 ms | 0 | — | 0 |
| `/disclaimer?redirect=%2F` | 2 | 1 665 ms | 0 | — | 1 |
| `/disclaimer?redirect=%2Fintelligence` | 1 | 1 288 ms | 0 | — | 0 |
| `/ask-ai` | 1 | 798 ms | 1 | 24 ms | 0 |
| `/login` | **0** | — | 0 | — | 0 |

Dos hechos incómodos sostienen el rediseño:

1. **Las 23 sesiones de `/` son todas del harness** (cookie forjada con
   `TEST_AUTH_EMAIL`). El n de campo real de `/` es **0**. Matiz importante: la
   marca `synthetic` empieza a escribirse con este cambio, y las filas
   históricas **no** la tienen, así que G-2 las seguirá contando (23) hasta que
   salgan de la ventana de 7 días. El filtro no las limpia retroactivamente
   porque no hay forma de distinguirlas sin la marca — que es, literalmente, la
   deuda que TD-25 cierra.
2. **`/login` no aporta LCP**: 15 filas en 7 d y **0** valores de LCP (1 sesión).
   Mecanismo no verificado; queda como sub-ítem de TD-25. Sin LCP, `/login` no
   puede alimentar G-2 hoy.

### Opción rechazada: beacon en un placeholder antes del redirect

Se propuso montar el beacon en una pantalla "Cargando…" con `setTimeout(2500)`
antes de redirigir, para que `/` emitiera filas anónimas. **Rechazada**, por tres
razones:

1. **Mide el placeholder, no la landing**: el LCP del `<p>Cargando…</p>` es el
tiempo hasta un texto que el usuario no pidió, y no es comparable con el LCP del
hero que el gate debe proteger.
2. **Es una regresión de UX deliberada**: +2,5 s a cada visitante anónimo para
alimentar un dashboard interno.
3. **No resuelve la causa**: seguiría sin haber usuarios reales midiendo, que es
el problema de fondo (TD-25), no un problema de montaje del beacon.

### Protocolo G-1 (medición sintética reproducible)

```bash
LCP_PROFILE=desktop LCP_RUNS=3 node scripts/e2e/lcp-diag.mjs
LCP_PROFILE=mobile  LCP_RUNS=3 node scripts/e2e/lcp-diag.mjs
```

Sesión real (`TEST_AUTH_EMAIL`), contra la build desplegada, mismo host:

- `desktop`: Chromium estable, sin throttling.
- `mobile`: CPU 4× + Slow 4G (150 ms RTT, 1,6 Mbps) + viewport 412×915 — valores
de referencia de Lighthouse mobile. Cubre **TD-23c** (0 % de sesiones móvil en
campo), que el gate anterior no podía medir.

Cada corrida deja rastro en `web_vitals_logs` con `synthetic: true` y
`syntheticProfile` en `raw_payload` (campo añadido al beacon y al schema zod el
2026-10-30), de modo que G-2 puede excluirlas. Cualquier automatización queda
marcada también vía `navigator.webdriver`, aunque el script no lo declare.

### Línea base G-1 — 2026-10-30 (día 1 de 3)

Primera medición con el gate v2, contra producción y con la marca de procedencia
ya desplegada. `LCP_RUNS=3` por perfil:

| Perfil | LCP por corrida | p75 | ¿< 2 500 ms? | FCP | TTFB | Long tasks (total) | CLS |
|--------|-----------------|-----|--------------|-----|------|--------------------|-----|
| `desktop` | 2 164 · 1 008 · 1 004 ms | **2 164 ms** | ✅ | 2 164 · 1 008 · 1 004 ms | 261–293 ms | 527–860 ms | 0–0,01 |
| `mobile` | 2 680 · 3 352 · 3 092 ms | **3 352 ms** | ❌ +852 ms | 1 896–1 932 ms | 276–361 ms | 3 670–4 436 ms | 0,02–0,029 |

**G-1: escritorio en verde, móvil en rojo.** Es el resultado que el gate anterior no
podía producir: con 0 % de sesiones móviles en campo (TD-23c), el "p75 de campo"
siempre fue un número de escritorio disfrazado de universal. Bajo CPU 4× + Slow 4G el
LCP sube ~55 % (2 164 → 3 352 ms). Ojo con la lectura fácil de las long tasks: su total
(3 670–4 436 ms) es de toda la sesión, pero **antes del LCP solo hay 276–502 ms** (ver
Diagnóstico abajo); el TTFB es casi idéntico en ambos perfiles (261–293 vs 276–361 ms).

Verificación de la marca en BD para esa corrida (6 sesiones, todas etiquetadas):

| Perfil | sesiones | `synthetic` | LCP máx. por sesión |
|--------|----------|-------------|---------------------|
| `desktop` | 3 | `true` | 2 164 · 1 008 · 1 004 ms |
| `mobile` | 3 | `true` | 2 680 · 3 352 · 3 092 ms |

La consulta G-2 de abajo, ejecutada tras la corrida, **sigue mostrando `/` con n=23 y
p75 5 716 ms**: son las filas históricas sin marca, que no pueden excluirse
retroactivamente. Confirma en la práctica el matiz documentado más arriba — el filtro
empieza a discriminar desde este deploy, no antes.

**REQ-002 sigue ABIERTO**: el DoD pide tres días distintos y `mobile` no cumple.

### Diagnóstico de causa raíz — Paso 1 (2026-10-30)

Objetivo: explicar por qué el LCP móvil (3 352 ms p75) duplica al de escritorio
(2 164 ms). Cada hipótesis se probó con una medición propia, no por inspección:

| Hipótesis | Cómo se probó | Resultado |
|-----------|---------------|-----------|
| El servidor emite el hero tarde (streaming) | lectura por chunks del HTML con cookies, 3 corridas | **Descartada**: el hero viaja en el **primer chunk**, 289–599 ms (≈ TTFB); documento completo 1 250–1 500 ms |
| Un script bloquea el parser antes del hero | análisis del HTML: 22 scripts antes del hero con sus atributos reales | **Descartada**: 21 llevan `async`; el único clásico es `noModule` (polyfills, 110 KB), que los navegadores modernos **no descargan** (0 entradas en resource timing) |
| Las webfonts retrasan el LCP | A/B con `.woff2` abortado, 3 vs 3 | **Descartada**: control 2 044–2 532 ms vs bloqueadas 1 956–2 568 ms |
| La red (bytes) | perfil solo-red vs solo-CPU, 3 cada uno | **Inconcluso**: solo-red 1 475–1 606 ms, solo-CPU 1 376–2 907 ms, ambos 1 704–1 964 ms — el ruido entre sesiones (±800 ms) se come el efecto |

Lo que queda medido: TTFB 276–361 ms en ambos perfiles; CSS render-blocking (32 KB)
termina en 1 406–1 538 ms; FCP móvil 1 784–1 932 ms; long tasks antes del LCP 276–502 ms.

**Advertencia metodológica:** el sondeo de visibilidad del hero corre en el hilo
principal, así que bajo CPU 4× sus muestras se retrasan y sus tiempos son **cotas
superiores**, no mediciones exactas. Y la varianza del LCP móvil entre sesiones
idénticas (±800 ms) es hoy mayor que cualquier efecto que se quiera atribuir a n=3.

**Conclusión del Paso 1: no hay un único culpable identificable con la instrumentación
actual.** Quedan descartados servidor, JS bloqueante y fuentes. El coste residual está
repartido entre CSS render-blocking, hidratación y trabajo de render, y el primer
requisito para optimizar ya no es un cambio de código sino **reducir el ruido**:
n ≥ 10 por configuración y una traza temporal (no un sampling profiler) del intervalo
TTFB → LCP.

### Consulta G-2 (campo, sin sintéticas)

```sql
with base as (
  select path, session_id, lcp::numeric as lcp, inp::numeric as inp
  from web_vitals_logs
  where recorded_at > now() - interval '7 days'
    and raw_payload->>'synthetic' is distinct from 'true'   -- TD-25
), per_session as (
  select path, session_id, max(lcp) as lcp, max(inp) as inp
  from base
  group by path, session_id
)
select path,
       count(lcp) as n_lcp,
       round(percentile_cont(0.75) within group (order by lcp)::numeric) as p75_lcp,
       count(inp) as n_inp,
       round(percentile_cont(0.75) within group (order by inp)::numeric) as p75_inp
from per_session
group by path
order by n_lcp desc;
```

G-2 solo se pronuncia con **n ≥ 20 sesiones** en la ruta; por debajo de eso se
reporta como muestra insuficiente, no como verde ni rojo.

### Re-medición de campo 2026-10-30 (ventana 7 d, dedupe por sesión — TD-23a)

Consulta de solo lectura sobre `web_vitals_logs` (`percentile_cont(0.75)` sobre una
fila por `(path, session_id)` para eliminar los beacons repetidos de una misma sesión).
Cifras recalculadas a las **15:56Z**, después de que el diagnóstico de la sección
siguiente añadiera 3 sesiones nuevas a `/`:

| Ruta | n LCP | p75 LCP | n INP | p75 INP | LCP < 2,5 s | INP < 300 ms |
|------|-------|---------|-------|---------|-------------|--------------|
| **`/`** | 25 | **5 812 ms** | 9 | **368 ms** | ❌ | ❌ |
| `/intelligence` | 3 | 3 332 ms | 2 | 48 ms | ❌ | ✅ |
| `/projects/05eb80d6…` | 2 | 5 373 ms | 0 | — | ❌ | — |
| `/ask-ai` | 1 | 798 ms | 1 | 24 ms | ✅ | ✅ |

Volumen crudo de `/` (7 d, al 2026-10-30T15:56Z): **600 filas / 35 sesiones**
(2026-10-23 → 2026-10-30), con **4 filas mobile** de 600 → el sesgo de dispositivo
de TD-23c se mantiene.

### Corrección 2026-10-30 — no hubo regresión de telemetría

La lectura anterior ("ninguna fila de RUM para `/` posterior al push del 28-oct") era
correcta pero la inferencia no: se verificó ejecutando `scripts/e2e/lcp-diag.mjs`
(2026-10-30T15:56Z) con sesión real forjada, que escribió **9 filas nuevas de `/`**
—el beacon funciona:

| Run | LCP | TTFB | `lcpElement` | `lcpResourceLoadDelay` | `lcpResourceLoadTime` | `lcpElementRenderDelay` |
|-----|-----|------|--------------|------------------------|-----------------------|-------------------------|
| 1 | 1 192 ms | 294 ms | `h2.font-display…text-foreground.mt-1` | 0 | 0 | 898 ms |
| 2 | 2 056 ms | 595 ms | idem | 0 | 0 | 1 461 ms |
| 3 | 2 304 ms | 258 ms | idem | 0 | 0 | 2 047 ms |

**Causa real del silencio 28→30 oct: ausencia de tráfico, no fallo de instrumentación.**
`/` exige sesión: un visitante anónimo es redirigido por el *disclaimer gate* de
`src/proxy.ts` (o a `/login` en `src/app/page.tsx`) **antes de pintar**, así que el
navegador nunca ejecuta el beacon con `path=/`. Prueba: con el **mismo** layout raíz
(`src/app/layout.tsx`, beacon `lazyOnload`), el 28-oct sí hay filas de `/login` (15) y
`/intelligence` (3), y el 29-oct de `/projects/…` (1). El único tráfico que produce
filas de `/` es el harness propio (cookie forjada con `TEST_AUTH_EMAIL`).

**La cadena de atribución (TD-23b) queda confirmada en campo**: `lcpElement` viaja en
`raw_payload->'vitals'` y el elemento medido es el `h2` del hero que F-C (commit
`aec3099`) sacó del `<Suspense>`. La descomposición prueba además que el coste residual
es **render delay** (898–2 047 ms) con **0** de carga de recurso → el cuello de botella
está en el renderizado/bloqueo del hilo, no en descargar un recurso. F-C **no** rompió
el LCP: el hero es el elemento LCP.

### Por qué el p75 de campo no es interpretable hoy (TD-25)

El p75 se mantiene en 5 812 ms (n=25) pese a que las tres corridas de hoy miden 1 192–
2 304 ms. La muestra es **bimodal** y está dominada por sesiones previas a la atribución:

| Tramo | Sesiones | Rango LCP | Ventana | Con atribución |
|-------|----------|-----------|---------|----------------|
| Alto | 7 | 5 704–9 208 ms | 2026-10-20 → 10-27 | No |
| Bajo | 21 | 924–4 276 ms | 2026-10-23 → 10-30 | Sí (desde 27-oct) |

Desde que existe el attribution build (27-oct) **ninguna** sesión supera 4 276 ms, pero
n=3 para hoy exige prudencia: mismo host, escritorio, AR, sin throttling. No es evidencia
suficiente para declarar mejora; sí para descartar la regresión de telemetría.

**Estado del gate: ABIERTO con gate v2 — día 1 de 3 medido: `desktop` 2 164 ms ✅ /
`mobile` 3 352 ms ❌ (ver "Línea base G-1" arriba).** La razón ya no es "esperar a que vuelva a
llegar tráfico": es que el tráfico de campo **no existe** (0 sesiones reales de `/`,
0 valores de LCP en `/login`), así que el cierre se decide con G-1 —medición
sintética reproducible bajo perfil declarado— y G-2 queda como corroboración cuando
haya muestra. Esta sección conserva el diagnóstico que motivó el cambio: el sesgo
bimodal de la muestra antigua y la ausencia de atribución antes del 27-oct no eran
defectos del beacon, eran el resultado de mezclar corridas del harness con usuarios
reales (TD-25).
Lab histórica (2026-10-18, Lighthouse 13.7.0 vs `scaudit.vercel.app`, 1 run):
LCP 3,76 s · TBT 1.408 ms — referencia, ya no gate. `/login` cumple REQ-001
(LCP 2,33 s, score 76); `/pricing` score 82 — la brecha es específica de la
ruta raíz. **Conclusión 2026-10-27:** INP cumple con margen; el gate lo falla
LCP → H-10b abierto en fase B (atribución LCP), ver
`docs/performance/H-10b-react-dom-investigation.md`.

## Causas conocidas (evidencia)

1. **H-10 — JS inicial +29% raw** (1025,6 → 1324 KB): chunk de `react-dom`
   229→398 KB (Turbopack fusionó chunks compartidos, [INFERRED] causa exacta sin
   cerrar) + 2 chunks menores. — `PERFORMANCE_REPORT.md` §8.2.
2. **H-01 persistente** — hidratación del shell: pestañas/copiloto ya lazy, pero
   el TBT >1 s en `/` no baja; el fondo `NeuralNetworkBackground` fue diferido
   el 2026-10-01 sin re-medir.

## Plan de cierre (mañana, H-10 primero)

| Paso | Acción | Criterio de salida |
|------|--------|--------------------|
| 1 | Cerrar H-10 INFERRED→CONFIRMED: diff de imports compartidos vs build del 09-26 (git log + route-bundle-stats) | causa documentada con commit/cambio responsable |
| 2 | Fix de bajo riesgo del bundle (re-segregar `next/dynamic` o `optimizePackageImports`) | `/` raw ≤ baseline 1.026 KB |
| 3 | Dividir hidratación del shell (tabs en clientes separados + Suspense) | TBT ↓ medible en lab |
| 4 | Re-medir Lighthouse `/` contra producción (lab de referencia) | score >80 |
| 5 | Validar con G-1 (sintético, ambos perfiles) y contrastar con G-2 (campo) | **gate v2: p75 LCP <2,5 s en `desktop` y en `mobile`, 3 corridas** |

## Definición de hecho (DoD)

REQ-002 se cierra con **G-1 en verde tres veces consecutivas, en días distintos, y
en ambos perfiles** (`desktop` y `mobile`), contra la build desplegada, con G-2 sin
contradicción cuando exista muestra. Un solo run verde no cierra, y un G-2 rojo con
n ≥ 20 sesiones reabre el requisito aunque G-1 esté verde.

## Dependencias

- H-09 (RUM): el plan config de Vercel + snippet es del owner (dashboard, no repo).
- H-10: requiere confirmar la causa antes de tocar código (regla del gate anti-sopa).
