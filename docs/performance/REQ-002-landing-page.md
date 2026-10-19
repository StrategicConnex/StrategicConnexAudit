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

## Requisito

| Métrica | Objetivo | Medido hoy (producción, 2026-10-18) | Estado |
|---------|----------|-------------------------------------|--------|
| LCP | **< 2,5 s** | 3,76 s | ❌ +1,26 s |
| TBT | **< 300 ms** | 1.408 ms | ❌ |
| Score Lighthouse perf | **> 80** | **63** | ❌ −17 pts |

Fuente: `docs/improvements/PERFORMANCE_REPORT.md` §8.1 (Lighthouse 13.7.0 vs
`scaudit.vercel.app`, 1 run). `/login` ya cumple REQ-001 (LCP 2,33 s, score 76);
`/pricing` score 82 — la brecha es específica de la ruta raíz.

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
| 4 | Re-medir Lighthouse `/` contra producción | REQ-002: LCP <2,5 s · TBT <300 ms · score >80 |
| 5 | (Si RUM activo — ver H-09) validar con datos de campo | p75 LCP usuario real <2,5 s |

## Definición de hecho (DoD)

REQ-002 cerrado solo con tres medidades consecutivas en verde contra producción
(gate defendible, no lab-único), registrado en PERFORMANCE_REPORT §8 con score
y fecha. Un solo run verde no cierra.

## Dependencias

- H-09 (RUM): el plan config de Vercel + snippet es del owner (dashboard, no repo).
- H-10: requiere confirmar la causa antes de tocar código (regla del gate anti-sopa).
