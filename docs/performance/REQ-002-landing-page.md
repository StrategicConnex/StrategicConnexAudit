---
layout: default
title: REQ-002 — Landing Page (/)
nav_order: 8.10
permalink: /docs/performance/req-002-landing-page
version: 1.0
fecha: 2026-10-18
autor: StrategicConnex Engineering
estado: Propuesto
---

# REQ-002 — Landing Page (`/`)

> **Nota de alcance (2026-10-19):** el prefijo `REQ-002` de ESTE documento pertenece
> al espacio de nombres de **rendimiento** (`docs/performance/REQ-xxx`, feats de
> optimización). Coincide numéricamente con el `REQ-002` del ROADMAP histórico
> (`docs/improvements/ROADMAP.md`, "Fase 1 — P0 Fundación") pero no es el mismo
> requisito. En auditorías, invalidar por árbol: Rendimiento aquí, Roadmap ahí.

## Requisito

**Gate de cierre (corregido 2026-10-27):** `p75 LCP campo < 2,5 s` ∧ `p75 INP campo < 300 ms`,
medidos con self-RUM en `web_vitals_logs`. El TBT se sustituyó por INP porque
web-vitals de navegador **no reporta TBT** (métrica de lab); INP es su
estándar de campo (web.dev). Lighthouse queda como referencia de lab, no como
gate.

| Métrica | Objetivo | Medido hoy (campo, 24 h al 2026-10-27) | Estado |
|---------|----------|---------------------------------------|--------|
| **p75 LCP (campo, self-RUM)** | **< 2,5 s** | 5,704 s (n=5) | ❌ +3,2 s |
| **p75 INP (campo, self-RUM)** | **< 300 ms** | 192 ms (n=11) | ✅ |
| Score Lighthouse perf (lab, ref.) | > 80 | 63 (2026-10-18) | ❌ −17 pts |

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

**Estado del gate: ROJO y ABIERTO**, pero por una razón distinta a la registrada el
30-oct: no espera "que vuelva a llegar tráfico" (no hay tráfico orgánico ni lo habrá a
corto plazo), sino que la muestra de campo **separe sesiones de harness de usuarios
reales** y deje de mezclar dos generaciones de instrumentación (TD-25).
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
| 5 | Validar con datos de campo (self-RUM — ver H-09) | **gate: p75 LCP <2,5 s ∧ p75 INP <300 ms** |

## Definición de hecho (DoD)

REQ-002 cerrado solo con tres medidades consecutivas en verde contra producción
(gate defendible, no lab-único), registrado en PERFORMANCE_REPORT §8 con score
y fecha. Un solo run verde no cierra.

## Dependencias

- H-09 (RUM): el plan config de Vercel + snippet es del owner (dashboard, no repo).
- H-10: requiere confirmar la causa antes de tocar código (regla del gate anti-sopa).
