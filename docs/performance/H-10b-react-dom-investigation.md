# H-10b: Investigación chunk react-dom (+69.9 KB, causa INFERRED)

## Estado: ABIERTO — FASE B (atribución LCP) · gate de apertura verificado 2026-10-27

## Contexto

Tras el fix de H-10 (commit `ede6e94`: supabase → `await import` en 3 puntos
realtime), la ruta `/` mejoró 17.3% (1.324 KB → 1.095 KB raw, 399 KB → 330 KB
gzip).

El delta restante vs baseline 09-26 es **+69.9 KB raw**, todo en el chunk
react-dom (388 KB, causa INFERRED — posible fusión Turbopack + react 19.2.4).

## Regla de decisión (2026-10-20)

El fix de H-10 ya entregó una mejora sustentable del 17% sin tocar diseño ni
estructura. La investigación del chunk react-dom **solo se abre si los datos de
campo (self-RUM, activo desde `3143adc`) muestran al cierre de 48h que NO se
alcanzan las metas REQ de campo**:| Gate | Fuente | Meta |
|------|--------|------|
| p75 LCP campo | `web_vitals_logs` (self-RUM) | < 2.5 s |
| p75 INP campo | `web_vitals_logs` (self-RUM) | < 300 ms |

**Corrección de gate 2026-10-27 (D2, aprobada en revisión):** la fila original
pedía *p75 TBT campo < 300 ms*, pero web-vitals de navegador **no reporta TBT**
(métrica de lab) — el gate era imposible por diseño y la investigación habría
empezado ciega. Se sustituye por INP, su estándar de campo (web.dev), y se
añade el mismo gate a REQ-002. Sin datos de campo → NO investigar (repite el
patrón H-09/H-10: optimizar sin medir).

## Hipótesis actuales (INFERRED, no confirmadas)

- **H1.** Turbopack fusionó módulos nuevos dentro del chunk react-dom
  (un componente client nuevo en `/` sin lazy load).
- **H2.** Duplicación de react-dom (dos copias resueltas por pnpm).
- **H3.** Import client-side de librería server-only o pesada
  (recharts, pdf, etc.) que antes estaba diferida.

## Método de investigación (solo si p75 de campo no alcanza REQ-002)

1. `git log --oneline --since=2026-09-26 -- src/app/page.tsx src/app/\(landing\)/`
   → qué cambió en `/` desde el build del 09-26.
2. Diff de imports: comparar imports client de `/` hoy vs 09-26.
3. Build actual y listar chunks de `/` con tamaños; inspeccionar el contenido
   del chunk react-dom (grep de rutas de módulos dentro del chunk).
4. `pnpm why react-dom` / `pnpm ls react-dom` → descartar H2.
5. Veredicto: **CONFIRMED** (causa X, evidencia Y) o **REFUTED**.

## Prohibido en esta fase

- Cambiar diseño, contenido o copy de `/`.
- Tocar `proxy.ts`, RLS, auth o el pool de IA.
- «Optimizaciones» sin medición antes/después.
- Investigar react-dom antes de tener p75 de campo.

## Métricas actuales (2026-10-20)

| Métrica | Valor | REQ | Estado |
|---------|-------|-----|--------|
| LCP (lab) | 3.76 s | < 2.5 s | ❌ |
| TBT (lab) | 1.408 ms | < 300 ms | ❌ |
| Score (lab) | 63 | > 80 | ❌ |
| LCP p75 (campo) | 5.704 ms (n=5, 24h) | < 2.5 s | ❌ gate roto → INVESTIGAR |
| INP p75 (campo) | 192 ms (n=11, 24h) | < 300 ms | ✅ cumple |

Las métricas de campo provienen del self-RUM (H-09, beacon `vitals.js` activo en
el layout — habilitado por commits `b125550` / `3143adc` / `ff3bad2`). El hostless
probe del 2026-10-20 verificó POSTs 204 reales del beacon; las filas caen en
`web_vitals_logs` (columna temporal: `recorded_at`).

## Criterios de cierre

- [x] 48h de datos RUM acumulados (desde deploy `3143adc` + `ff3bad2`) —
      verificado 2026-10-27.
- [ ] p75 LCP campo < 2.5 s **Y** p75 INP campo < 300 ms → cerrado sin acción
      (2026-10-27: INP ✅ 192 ms, LCP ❌ 5704 ms → no se cierra sin acción).
- [ ] Fase B (atribución): segmentar `raw_payload` por ruta + descomponer LCP
      (TTFB / load delay / load time / render delay) + elemento LCP p75 →
      punto de decisión (bundle vs recurso vs render).
- [ ] Si la atribución confirma causa → fix de bajo riesgo, re-medir.

## Notas

- La investigación react-dom es **research de alta incertidumbre**: puede
  terminar en «es el tamaño normal de react 19.2.x» sin acción posible.
- Invertir en ella **antes de tener datos de campo** repite el patrón que
  H-09/H-10 acaban de eliminar: optimizar sin medir.
- El fix de H-10 ya dio una mejora sustentable del 17% sin tocar UX/estructura.

## Fecha de revisión

**2026-10-22** (48h después del deploy con RUM activo).
