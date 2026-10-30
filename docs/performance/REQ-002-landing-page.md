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

### Re-medición de campo 2026-10-30 (ventana 7 d, dedupe por sesión — TD-23a)

Consulta de solo lectura sobre `web_vitals_logs` (`percentile_cont(0.75)` sobre una
fila por `(path, session_id)` para eliminar los beacons repetidos de una misma sesión):

| Ruta | n LCP | p75 LCP | n INP | p75 INP | LCP < 2,5 s | INP < 300 ms |
|------|-------|---------|-------|---------|-------------|--------------|
| **`/`** | 22 | **6 070 ms** | 9 | **368 ms** | ❌ | ❌ |
| `/intelligence` | 3 | 3 332 ms | 2 | 48 ms | ❌ | ✅ |
| `/projects/05eb80d6…` | 2 | 5 373 ms | 0 | — | ❌ | — |
| `/ask-ai` | 1 | 798 ms | 1 | 24 ms | ✅ | ✅ |

Volumen crudo de `/`: **591 filas / 32 sesiones** (2026-10-23 → **2026-10-27T23:55Z**),
con **4 filas mobile** de 591 → el sesgo de dispositivo de TD-23c se mantiene.

**Hallazgo crítico de la sesión:** no hay **ninguna** fila de RUM para `/` posterior al
push del 2026-10-28 (`2dd4a91`). Con el dedupe por sesión el p75 LCP sigue en **6,07 s**
(n=22) y el p75 INP pasa a **368 ms** — con la ventana de 7 d y dedupe, INP tampoco cumple
(el 192 ms previo era la ventana de 24 h sin dedupe). No existe, por tanto, evidencia de
campo post-push que permita atribuir mejora o regresión: **el gate REQ-002 sigue ROJO y
la medición post-push está pendiente de que vuelva a llegar tráfico a `/`.**
| Score Lighthouse perf (lab, ref.) | > 80 | 63 (2026-10-18) | ❌ −17 pts |

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
