# H-10b: Investigación chunk react-dom (+69.9 KB, causa INFERRED)

## Estado: F-A + F-B DESPLEGADOS 2026-10-28 (Fase D) — FCP resuelto en lab (−1,7…−2,9 s); LCP sigue en 2,4–3,6 s sobre meta 2,5 s → **F-C pendiente de aprobación del owner** · causa: streaming del servidor + main-thread (Fase C)

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

## Fase B — Atribución LCP (2026-10-27, self-RUM 7 días)

### Composición por ruta (p75, 7d)

| Ruta | n | TTFB | FCP | LCP | Cliente (LCP−TTFB) | Veredicto |
|------|---|------|-----|-----|--------------------|-----------|
| `/login` | 792 | 2153 | 3784 | 105806 ⚠️ | — | **artifacto de medición** (TD-23): 1036 filas = 6 sesiones, 2 valores LCP |
| **`/` (landing)** | 673 | 2165 (hoy ~200) | 3976 | **7196** | ~7042 | **aquí está el gate roto** |
| `/projects/*` | 10+8 | 583–1971 | 2646 | 5100–5525 | 3554–5008 | secundario |
| `/ask-ai` | 711 | 506 | 565 | 798 | 292 | referencia rápida ✅ |

### Tendencia de `/` por día (FCP · LCP · TTFB p75)

| Día | LCP | TTFB |
|-----|-----|------|
| 10-20 | 5872 | 3221 |
| 10-21 | 5740 | 3173 |
| 10-23 | 8504 | 927 |
| 10-24 | 7304 | 336 |
| 10-25 | 7196 | **154** |
| 10-26 | 5704 | 238 |

### Veredicto de atribución

1. **TTFB ya no es el problema**: colapsó de 3221 ms (20–21 oct) a 154–239 ms
   (25–26 oct).
2. **FCP p75 ≈ 3,0–4,0 s con TTFB ~200 ms → ~2,7–3,8 s entre primer byte y
   primer pintado** → render-blocking en el critical path del shell (coherente
   con H-01).
3. **LCP − FCP ≈ +3,2 s** en `/`: el elemento LCP pinta segundos después del
   primer pintado (descubrimiento/carga tardía o swap de hidratación). CLS
   0.0075 descarta layout shift grande.
4. **LCP estable ~7,2 s desde el 20-oct**: estructural, no incidente. La
   “tendencia favorable” 7d→48h fue **efecto de composición de tráfico**
   (25–26 oct dominados por `/ask-ai`, rápido), no mejora real.
5. **Sin mobile en campo**: 2213/2213 eventos desktop — el gate se mide solo
   con escritorio (TD-23).

### Veredicto sobre la hipótesis original (chunk react-dom)

**REFUTADA como causa primaria**: INP p75 192 ms (interactividad sana), TTFB
arreglado, LCP estable y estructural. La composición (FCP−TTFB + LCP−FCP) apunta
a render-blocking y elemento tardío, no a tamaño de bundle.

### Punto de decisión (siguiente paso)

Causa acotada a dos frentes medibles en `/`:

- **(i) render-blocking** (FCP−TTFB ≈ 2,7 s): CSS crítico inline / defer de no
  crítico.
- **(ii) elemento LCP tardío** (LCP−FCP ≈ 3,2 s): `preload`/`fetchpriority` si
  es imagen; SSR del hero si es contenido de hidratación.
- **Elemento exacto — HABILITADOR EJECUTADO 2026-10-27**: el beacon desplegado
  no reportaba `lcpElement` (0/1272 filas; web-vitals base build no expone
  `.element` — vitals.js:271 era dead code; TD-23.b). Se implementó el
  **attribution build de web-vitals@3.5.2** self-hosted
  (`public/vendor/web-vitals.attribution.iife.js`, oficial del paquete — base
  verificado byte-idéntico al vendor actual) + captura del selector y de la
  descomposición (`lcpTTFB`/`lcpResourceLoadDelay`/`lcpResourceLoadTime`/
  `lcpElementRenderDelay`). **Test dev verificado end-to-end**: probe devuelve
  el elemento real y payload final del beacon con la descomposición que cierra
  exacta (ttfb 2224 + loadDelay 0 + loadTime 0 + renderDelay 2399 = lcp 4623),
  sin escribir en la BD (interceptores + project-id falso). Sube con el push
  del 28-oct; los datos de campo reales llegan en 48 h.
- **Hallazgo de estructura (dev, a confirmar en campo)**: el elemento LCP de
  `/` es **texto — el `h2` del hero** (`h2.font-display.text-2xl.font-
  extrabold…`), con **loadDelay = loadTime = 0** → el gap LCP−FCP es puro
  **elementRenderDelay**. Prioriza hipótesis de pintado tardío del texto
  (font-display bloqueando / swap por hidratación) y **de-prioriza**
  `preload` de imágenes (no hay recurso de imagen en el elemento LCP).

Método: 1 Lighthouse run en `/` (filmstrip + render-blocking) → fix acotado →
re-medir p75 de campo 48 h. **Retitular H-10b: “LCP del landing `/`”** — ya no
“chunk react-dom”.

## Fase C — Diagnóstico de laboratorio autenticado (2026-10-28)

### Método

`scripts/e2e/lcp-diag.mjs`: sesión real en prod (password grant + cookie
forjada, mismo patrón que `audit-chat-prod.mjs`), 3 navegaciones frías a `/`
con observadores buffered (paint, LCP con elemento, long tasks, font-face,
recursos) + fetch del documento para medir streaming y presencia del `h2` en
el HTML SSR.

### Datos (3 corridas, 2026-10-28)

| Señal | Corridas | Lectura |
|-------|----------|---------|
| TTFB | 246 / 253 / 252 ms | ✅ sano |
| Fin de streaming del documento | 1919 / 1916 / 1841 ms | ❌ **el servidor tarda ~1,65 s** en terminar de emitir (auth `getUser()` + queries RLS dentro del `<Suspense>`) |
| Fuentes (3 woff2, 112 KB) | cargadas a **1134 / 948 / 726 ms** | ❌ **hipótesis font REFUTADA** — ~1 s << LCP; CLS 0–0,005 |
| FCP = LCP (el `h2` del hero) | 3924 / 2788 / 2716 ms | el `h2` va en el HTML SSR y pinta **sin hidratación** → hipótesis de “hidratación del hero” REFUTADA |
| Long tasks previas al LCP | 455 / 426 / 274 ms (eval del bundle) | ❌ main-thread ocupada entre fin de doc y paint |
| `DashboardSkeleton` (fallback) | pinta pero **sin texto** → no cuenta como FCP ni LCP | hallazgo clave |

El HTML SSR **sí contiene el hero** (`hasHeroEs: true`, 136 KB) y el elemento
LCP de campo (`h2.font-display…mt-1`, “Tienes N proyectos en monitoreo”) es el
saludo del **dashboard** — no un landing de marketing: `page.tsx` redirige a
`/login` sin sesión, así que **todos los eventos `/` del RUM son la vista
autenticada** (reframe de REQ-002).

### Veredicto — descomposición real del LCP

```
LCP 2,7–3,9 s (lab) / 2,4–8,6 s (campo) =
  TTFB ~0,25 s
+ streaming del servidor ~1,65 s   ← auth Supabase + queries RLS; el fallback
                                     sin texto no pinta contentful
+ main-thread ocupada 0,8–2,0 s    ← eval/hidratación del bundle (long tasks)
```

El outlier de campo de 8,6 s es la cola fría del pooler/lambda (misma
descomposición, más latencia de BD) — por eso la varianza. Las hipótesis de
la propuesta original (font-display: swap / preload manual / font-display:
quedan descartadas con datos: `next/font` ya auto-hace preload y las fuentes
cierran ~1 s antes que el LCP.

### Fix propuesto (rankeado; F-A/F-B ejecutados, F-C requiere aprobación)

| # | Fix | Impacto esperado en LCP | Riesgo | Estado (2026-10-28) |
|---|-----|------------------------|--------|---------------------|
| F-A | **Paralelizar `loadDashboardData`**: `integrations`/`audits` vía `Promise.all` (hoy secuenciales) + considerar pooler warm | −0,3…−0,8 s y, sobre todo, **reduce la cola fría del outlier 8,6 s** | bajo (mismo contrato, queries independientes) | ✅ `cee6795` — **medido: ~0 s** (ver nota F-A) |
| F-B | **`DashboardSkeleton` contentful** (texto real del saludo + “Cargando…”): FCP ≈ 1 s en vez de 2,7–3,9 s. *Nota honesta: el LCP final sigue siendo el `h2` real (texto más grande), así que mejora FCP/no-LCP* | FCP −1,7…−2,9 s; LCP indirecto | bajo (solo fallback) | ✅ `f2ef5b0` — **medido: FCP −1,7…−2,9 s** (Fase D) |
| F-C | **Hero independiente de datos**: SSR del saludo sin `count` en el shell y `count` llegando después. Toca copy/estructura → **exige aprobación explícita** (regla “prohibido cambiar copy de `/`”) | −1,2…−2,4 s (pinta ≈ TTFB+CSS+shell; números actualizados abajo) | medio (UX/copy) | ⏳ **pendiente de aprobación** |

**Nota F-A (honestidad de medición — por qué el win es ~0):** `withRLS`
ejecuta todas las queries en la **misma conexión** de la transacción y pg
las serializa → `Promise.all` no reduce latencia de red en producción (solo
paraleliza en dev-bypass, que usa `directDb` de pool). Además `issues`
depende de `audits` (`latestCompletedIds`), así que ni siquiera es
paralelizable. La medición lo confirma: fin de streaming post-push
2,0–3,1 s vs baseline 1,8–1,9 s (ruido). **El win real de F-A vendrá de
cortar round-trips** (p. ej. plegar la agregación de `issues` dentro de la
query de `audits`), no de paralelizarlas.

Recomendación original — **ya ejecutada**: F-A + F-B (sin tocar copy), medir
en campo 48 h; si el p75 sigue sobre 2,5 s, llevar F-C a decisión del owner
con los números. → Desplegada el 2026-10-28; los números de F-C actualizados
están en la Fase D abajo.

### Fase D — verificación lab post-push (2026-10-28, `lcp-diag.mjs` ×3)

`hasSkeletonText: true` en el HTML streamueado confirma que el build nuevo
está en prod. 3 navegaciones frías, mismo método que la Fase C:

| Señal | Baseline (Fase C) | Post F-A+F-B | Lectura |
|-------|-------------------|--------------|---------|
| TTFB | 246/253/252 ms | 362/255/304 ms | ruido, sin regresión |
| Fin de streaming | 1919/1916/1841 ms | 2235/3118/2030 ms | sin cambio (esperado: F-A ≈ 0, nota arriba) |
| **FCP** | 3924/2788/2716 ms | **1272/2072/980 ms** | ✅ **F-B: FCP −1,7…−2,9 s** — el fallback pinta contentful |
| LCP (elemento) | 3924/2788/2716 ms (h2) | 3636/3540/2444 ms (h2 real) | el `h2` real sigue fijando LCP (como predijo F-B); −0,3…−0,5 s, dentro de ruido |
| CLS | 0–0,005 | 0,005 | sin regresión del swap skeleton→contenido |
| Fuentes | 1134/948/726 ms | 2058/1237/957 ms | ruido de red, sin impacto en LCP |

Veredicto: **FCP resuelto; LCP no** — sigue en 2,4–3,6 s contra meta <2,5 s,
y el único componente que falta es exactamente el que ataca **F-C**.

### F-C con números actualizados (post Fase D)

- **Hoy (medido, lab):** LCP = 2,4–3,6 s = TTFB ~0,3 s + streaming ~2,0–3,1 s
  + main-thread (long tasks 274–455 ms) → el `h2` real pinta al final de todo.
- **Con F-C** (hero SSR sin `count` en el shell, fuera del `<Suspense>`): el
  hero pintaría a ≈ TTFB + CSS + shell ≈ **0,6–1,2 s** → **LCP −1,2…−2,4 s**;
  con eso el p75 de campo proyecta **< 2,5 s** (REQ-002) — proyección, no
  medición: se confirma con la query de 48 h de abajo.
- **Coste:** toca copy/estructura de `/` (el saludo pierde el `count` en el
  primer paint; llega en el mismo bloque, después) → **exige aprobación
  explícita del owner**.
- **Recomendación: aprobar F-C.** F-A ya no mueve LCP y F-B ya hizo su parte
  (FCP); sin F-C el gate de campo <2,5 s no se alcanza con estos dos.

### Verificación en campo (48 h post-fix; dedupe por sesión — TD-23a)

**Ventana:** correr a partir del deploy del **2026-10-28** (F-A+F-B); lectura
el **2026-10-30**. Mismo baseline de la Fase D para comparar.

```sql
WITH dedup AS (
  SELECT DISTINCT ON (session_id, path)
    session_id, path, lcp,
    (raw_payload->'vitals'->>'lcpElementRenderDelay')::numeric AS render_delay
  FROM web_vitals_logs
  WHERE recorded_at > now() - interval '48 hours'
    AND path = '/'
    AND raw_payload->'vitals'->>'lcpElementRenderDelay' IS NOT NULL
  ORDER BY session_id, path, recorded_at DESC
)
SELECT percentile_cont(0.75) WITHIN GROUP (ORDER BY render_delay) AS p75_render_delay,
       percentile_cont(0.75) WITHIN GROUP (ORDER BY lcp) AS p75_lcp,
       count(*) AS sesiones
FROM dedup;
```

Objetivo: p75 LCP < 2,5 s (REQ-002). Sin dedupe el p75 queda contaminado por
beacons repetidos de la misma sesión (TD-23a).

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
- [x] Fase B (atribución): segmentar `raw_payload` por ruta + descomponer LCP
      (TTFB / load delay / load time / render delay) + elemento LCP p75 →
      punto de decisión — completada 2026-10-27 (bundle REFUTADA; causa:
      render-blocking + elemento LCP tardío).
- [x] Fix de bajo riesgo + re-medición en lab — **F-A `cee6795` + F-B
      `f2ef5b0` desplegados y medidos 2026-10-28 (Fase D): FCP −1,7…−2,9 s,
      CLS sin regresión**. LCP aún sobre meta → F-C pendiente de aprobación.
- [ ] Verificación en campo 48 h post F-A+F-B (query con dedupe por sesión,
      arriba) → lectura **2026-10-30**: p75 LCP < 2.5 s cierra H-10b; si no,
      F-C va a decisión del owner.

## Notas

- La investigación react-dom es **research de alta incertidumbre**: puede
  terminar en «es el tamaño normal de react 19.2.x» sin acción posible.
- Invertir en ella **antes de tener datos de campo** repite el patrón que
  H-09/H-10 acaban de eliminar: optimizar sin medir.
- El fix de H-10 ya dio una mejora sustentable del 17% sin tocar UX/estructura.

## Fecha de revisión

**2026-10-30** (lectura de campo 48 h post F-A+F-B; última actualización de
registro: 2026-10-28 — Fase D).
