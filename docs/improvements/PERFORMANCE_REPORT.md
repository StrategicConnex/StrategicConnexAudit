# Performance Report — Core Web Vitals & Bundle (v2)

> **Fecha:** 26 de septiembre de 2026
> **Herramienta:** Lighthouse **13.5.0** (Chrome Headless 154, `--headless=new`) + análisis de artefactos de build **Turbopack / Next.js 16.3.3** (`route-bundle-stats.json`, `client-reference-manifest.js`, `build-manifest.json`) + HTML servido por `next start`
> **Alcance:** **build local** (`pnpm build`) + **lab local** (`next start -p 3100`). **Producción NO medida en esta ronda** (ver §7).
> **Baseline histórico:** `docs/improvements/PERFORMANCE_REPORT.md` del **31 de julio de 2026** (Lighthouse 13.4.1 contra `scaudit.vercel.app`). Sus cifras se conservan como columna *baseline 2026-07-31*.

---

## 1. Resumen ejecutivo

### 1.1 Comparativa Core Web Vitals: baseline 2026-07-31 (producción) vs 2026-09-26 (lab local)

| Métrica | `/login` baseline 2026-07-31 | `/login` **2026-09-26** | `/` baseline 2026-07-31 | `/` **2026-09-26** |
|---|---|---|---|---|
| Performance Score | 63 | **58** (mediana n=3) | 49 | **56** (mediana n=2) |
| FCP | 1.4 s | **1.28 s** | 1.6 s | **2.08 s** |
| LCP | 3.6 s | **4.67 s** | 5.2 s | **6.09 s** |
| CLS | 0 | **0** | 0 | **0** |
| TBT | 1020 ms | **1336 ms** | 3100 ms | **857 ms** |
| Speed Index | 5.2 s | **2.10 s** | 3.9 s | **2.08 s** |
| TTI | 4.2 s | **5.28 s** | 6.9 s | **6.28 s** |
| Transfer total | 442 KB | **434 KB** | 615 KB | **557 KB** |
| Peticiones | [NO MEDIDO] | **27** | [NO MEDIDO] | **57** |

> ⚠️ **Las dos columnas NO son directamente comparables.** El baseline se midió contra **producción en Vercel** (CDN, HTTP/3, Brotli, edge) y esta ronda contra **lab local** (`localhost:3100`, gzip de `next start`, CPU/Red virtualizadas por Lighthouse). La comparación se publica por continuidad del histórico, **no** como regresión ni como mejora atribuible al código. Ver §7.

### 1.2 Rutas nuevas medidas (sin baseline)

| Métrica | `/pricing` | `/docs` |
|---|---|---|
| Performance Score | **75.5** (n=2) | **81** (n=2) |
| FCP / LCP / CLS | 1.25 s / 3.95 s / **0** | 1.23 s / 4.10 s / **0** |
| TBT / SI / TTI | 509 ms / 2.04 s / 4.09 s | 280 ms / 1.75 s / 4.19 s |
| Transfer total / peticiones | 357 KB / 26 | 389 KB / 39 |

### 1.3 Hallazgos principales

1. **CLS = 0 en las 4 rutas medidas** ✅ (se mantiene el baseline perfecto).
2. **El TBT sigue siendo el cuello de botella** en `/login` (1336 ms) y `/` (857 ms): la hidratación del main thread consume **6.1–6.2 s** de trabajo total (`mainthread-work-breakdown`).
3. **Todas las librerías pesadas están en carga diferida** en las 11 rutas cuyo HTML fue verificado: `swagger-ui-react` (1.13 MB), `html2canvas`+`jsPDF` (409 KB), `mermaid` (640 KB), `leaflet` (175+145 KB) **no aparecen en ningún `<script>` inicial** ✅.
4. **2 excepciones eager detectadas:** `recharts` (6 chunks, 232 KB del principal) en **`/ai/health`** y `reactflow` (143 KB) en **`/intelligence`** (manifest `async=false`; HTML no verificable sin sesión).
5. **JS inicial de `/` y `/login` roza los 1 MB raw** (1026 KB / 978 KB con polifiles) — CSS global añade 218 KB raw más en **todas** las rutas.

---

## 2. Metodología

### 2.1 Build

```
pnpm build   →  exit 0 (Next.js 16.3.3 + Turbopack; 23 rutas de página + API)
```

### 2.2 Core Web Vitals (lab)

1. Servidor de producción local: `pnpm start -p 3100` (verificado con `Invoke-WebRequest`; **gzip confirmado** vía cabecera `Content-Encoding: gzip`).
2. Chrome presente en `C:\Program Files\Google\Chrome\Application\chrome.exe` (HeadlessChrome **154.0.0.0**).
3. Lighthouse 13.5.0, sólo categoría *performance*, throttling estándar de Lighthouse (CPU ×4, red Slow 4G):
   ```
   npx -y lighthouse@13.5.0 "<url>" --chrome-flags="--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage" --only-categories=performance --quiet --output=json
   ```
4. **9 invocaciones totales**: `/login` ×3, `/` ×2, `/pricing` ×2, `/docs` ×2. Se reporta la **mediana** (n=2 → media de los dos valores, indicado en cada fila).
5. Extraído de cada JSON: `categories.performance.score` y `audits` → `first-contentful-paint`, `largest-contentful-paint`, `cumulative-layout-shift`, `total-blocking-time`, `speed-index`, `interactive`, `total-byte-weight`, `network-requests`, `mainthread-work-breakdown`.

### 2.3 Bundle por ruta (dos fuentes cruzadas)

- **Fuente A (oficial, build):** `.next/diagnostics/route-bundle-stats.json` → `firstLoadUncompressedJsBytes` + `firstLoadChunkPaths` (suma de tamaños *raw* y *gzip* calculada fichero a fichero). **No incluye el polifil.**
- **Fuente B (empírica, HTML):** se pidió cada ruta al servidor de producción local y se extrajeron los `<script src>` y `<link rel="stylesheet">` reales; tamaño *raw* y *gzip* (nivel 9) leído de disco en `.next/static`.
- **Cruce:** A + polifil (`0cz1d0mv5g_q7.js`, 112.594 B) = B en las 5 rutas → **cuadra al byte** (p. ej. `/login`: 867,7 + 110,0 = 977,6 KB ✅).

---

## 3. Core Web Vitals — lab local (2026-09-26)

### 3.1 Tabla por ruta (mediana)

| Ruta | n | Score | FCP | LCP | CLS | TBT | Speed Index | TTI | Peso total | Peticiones | Main thread |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/login` | 3 (54/58/61) | **58** | 1.28 s | 4.67 s | **0** | 1336 ms | 2.10 s | 5.28 s | 434 KB | 27 | 6142 ms |
| `/` → `/login` | 2 (56/56) | **56** | 2.08 s | 6.09 s | **0** | 857 ms | 2.08 s | 6.28 s | 557 KB | 57 | 6206 ms |
| `/pricing` | 2 (71/80) | **75.5** | 1.25 s | 3.95 s | **0** | 509 ms | 2.04 s | 4.09 s | 357 KB | 26 | 2498 ms |
| `/docs` | 2 (76/86) | **81** | 1.23 s | 4.10 s | **0** | 280 ms | 1.75 s | 4.19 s | 389 KB | 39 | 2246 ms |

- Fecha/hora de la primera medición: `2026-09-26T22:20:05.910Z`.
- `/` responde con **redirect a `/login`** (verificado: `finalDisplayedUrl = http://localhost:3100/login`). Sus cifras reflejan la doble navegación (por eso 57 peticiones vs 27 en acceso directo).

### 3.2 Transfer por tipo (run 1 de cada ruta)

| Recurso | `/login` | `/` | `/pricing` | `/docs` |
|---|---|---|---|---|
| Document | 23 KB | 44 KB | 24 KB | 32 KB |
| **Script** | **260 KB** | **361 KB** | **186 KB** | **186 KB** |
| Font | 110 KB | 110 KB | 110 KB | 110 KB |
| Stylesheet | 32 KB | 32 KB | 32 KB | 32 KB |
| Image | 5 KB | 5 KB | 5 KB | 5 KB |
| Manifest / Other / Fetch | 4 KB | 6 KB | 6 KB | 28 KB |
| **Total** | **434 KB** | **557 KB** | **357 KB** | **389 KB** |

**Interpretación:**
- Las **fuentes** siguen costando **110 KB en TODAS las rutas** (baseline: 124 KB). Siguen siendo el mayor bloque no-JS.
- El **Script** domina el peso y el TBT. El chunk de `swagger-ui-react` (1.13 MB) **no** está en ninguna de estas rutas (verificado en HTML).

---

## 4. Bundle / JS inicial por ruta

### 4.1 HTML verificado (incluye polifil; servido por `next start`)

| Ruta | JS inicial raw | JS inicial gzip | Nº scripts | CSS raw / gzip | HTML |
|---|---|---|---|---|---|
| `/` | **1.050.261 B (1.025,6 KB)** | **323.519 B (315,9 KB)** | 20 | 232.063 / 31.183 B | 60.417 B |
| `/login` | **1.001.071 B (977,6 KB)** | **298.567 B (291,6 KB)** | 17 | 232.063 / 31.183 B | 69.024 B |
| `/swagger` | **727.907 B (710,8 KB)** | **224.640 B (219,4 KB)** | 15 | 232.063 / 31.183 B | 83.852 B |
| `/pricing` | **723.050 B (706,1 KB)** | **223.212 B (218,0 KB)** | 15 | 232.063 / 31.183 B | 80.213 B |
| `/docs` | **723.050 B (706,1 KB)** | **223.212 B (218,0 KB)** | 15 | 232.063 / 31.183 B | 99.934 B |

### 4.2 Diagnóstico oficial de Next (`route-bundle-stats.json`, sin polifil)

| Ruta | Chunks | First Load JS raw | gzip |
|---|---|---|---|
| `/ai/health` | 23 | 1.097,0 KB | 328,5 KB |
| `/intelligence` | 21 | 1.044,5 KB | 309,8 KB |
| `/` | 19 | 915,7 KB | 277,3 KB |
| `/login` | 16 | 867,7 KB | 253,0 KB |
| `/projects/[id]/audits/[auditId]` | 20 | 783,5 KB | 243,7 KB |
| `/docs/api` | 15 | 629,7 KB | 187,1 KB |
| `/mitre-coverage` | 16 | 618,6 KB | 187,5 KB |
| `/swagger` | 15 | 609,6 KB | 184,3 KB |
| `/docs` | 14 | 596,1 KB | 179,4 KB |
| `/pricing` | 14 | 596,1 KB | 179,4 KB |

*(23 rutas emitidas por el diagnóstico; se listan las 10 más pesadas + las rutas objetivo.)*

### 4.3 Totales de `.next/static`

| Concepto | Valor |
|---|---|
| Ficheros JS + CSS | **179** |
| Total **raw** | **9.248.222 B (9.031 KB ≈ 8,82 MiB)** |
| Total **gzip** (nivel 9) | **2.573.763 B (2.513 KB ≈ 2,45 MiB)** |
| Desglose | JS 8.821.354 B / CSS 426.868 B / WOFF2 353.224 B / ICO+PNG 29.351 B |
| Con todos los ficheros (199) | 9.630.798 B |

*(§4.1, §4.3 y §5 reflejan el build pre-auditoría H-05; las cifras posteriores a la auditoría están en §4.4.)*

### 4.4 Auditoría H-05 — composición del CSS global (2026-10-01)

**Composición del chunk eager en todas las rutas (build pre-auditoría, `2d0rji8dmxh87.css`, 222.781 B; §5.8):**

| Bloque | Bytes | % | Contenido |
|---|---|---|---|
| Infraestructura Tailwind v4 | 14.604 | 6,6% | `properties` 1.989 + `theme` 8.995 + preflight 3.602 + `components` 18 |
| Utilities | 190.970 | 85,7% | 2.485 reglas (media ~77 B/regla). Top familias: `bg` 32,9 KB, `border` 19,6, `shadow` 18,9, `text` 12,7, `transition` 12,6, gradientes `from/via/to` 12,2, `ring` 5,5. Variantes: `hover` 15,6 KB, `focus` 4,8, `sm` 4,0 |
| CSS de usuario | 17.207 | 7,7% | Tokens corporativos, temas dark/light OKLCH, view-transitions, glass, scrollbar, reduced-motion — global por diseño |

Además, `1usbhoulxz6_c.css` = 9.282 B de `@font-face` (Inter) también es eager en todas las rutas.

**Método del audit de utilities no usadas:** cada selector del `@layer utilities` se clasificó contra un corpus concatenado de `src/**` (4,17 MB) frente al resto del repositorio (8,07 MB). Resultado: **66 reglas / 5.203 B (2,3%) existían solo fuera de `src/`** (casi todas artefactos de parsing). Verificación manual: `transition-[all]` solo aparece en `docs/architecture/WEB-UI-GUIDELINES.md` (tabla de anti-patrones que lo bloquea) y `text-emerald-400/500` en `docs/archive/SCAUDIT-THEME.md` → **Tailwind v4 escaneaba `docs/`, `tests/` y `e2e/` como fuentes** y generaba utilidades huérfanas desde prosa y desde `docs/vendor/*.min.js` (vendor minificado).

**Acción aplicada:** `@source not` en `src/app/globals.css` para `../../docs`, `../../tests` y `../../e2e`.

| Métrica | Antes | Después | Δ |
|---|---|---|---|
| Chunk global raw | 222.781 B | 218.814 B (`1_idn1kpb-v_v.css`) | **−3.967 B (−1,8%)** |
| Chunk global gzip9 | 29.898 B | 29.382 B | **−516 B** |
| Reglas de utilities | 2.485 | 2.444 | −41 |
| CSS por ruta raw (global + fuentes) | 232.063 B | 228.096 B | −3.967 B |
| CSS por ruta gzip9 | 31.183 B | 30.667 B | −516 B |

*Validación del método de gzip:* el chunk de fuentes (inalterado) mide 1.285 B gzip9, exactamente el valor implícito en §4.1 (31.183 − 29.898) → las cifras son comparables método a método.

**Nota de build:** la caché persistente de Turbopack (`.next/cache`) **no invalidó el CSS** al cambiar solo las directivas `@source not`: el primer build sirvió el chunk antiguo byte a byte. Tras limpiar `.next/cache`, el build (`BUILD_EXIT=0`) aplicó la exclusión. Cualquier cambio de fuentes Tailwind requiere invalidar esa caché.

**"Separar CSS por ruta" — resultado: sin candidatos.** Inventario completo de `globals.css` (455 líneas): todo el CSS de usuario es global por diseño (tokens de tema, view-transitions, glass, scrollbar, reduced-motion); no hay bloques específicos de ruta. El CSS de vendor ya está por ruta/demand y no es eager: Swagger 177.243 B, Leaflet 10.572 B, React Flow 6.990 B. Trocear las utilities de Tailwind v4 por ruta no es viable en la arquitectura actual (pipeline único en el root layout; duplicaría infraestructura y añadiría riesgo de regresión visual sin soporte de la herramienta). Pool residual no-src tras la exclusión: 40 reglas / 2.928 B, casi todo artefactos de parsing (residual genuino < 0,5 KB) → sin más exclusiones.

**Conclusión:** CSS global de 217,6 → **213,7 KB raw** y 29,2 → **28,7 KB gzip9** por ruta. El resto son utilities genuinamente usadas por `src/` (97,7% verificado); reducir más exige refactor de diseño a nivel de app, no de build.

---

## 5. Chunks pesados — top-12 y estado lazy/eager

| # | Chunk | Raw | gzip | Librería / contenido | Estado |
|---|---|---|---|---|---|
| 1 | `1xby-pjphut2o.js` | 1.159.856 B (1.132,7 KB) | 326.681 B | `swagger-ui-react` | **LAZY** ✅ |
| 2 | `2_8wuwaw531t_.js` | 655.707 B (640,3 KB) | 141.394 B | `mermaid` | **LAZY** ✅ |
| 3 | `34gef7x3rx0-e.js` | 429.871 B (419,8 KB) | 134.310 B | resaltado de sintaxis / markdown (`highlight`+`marked`) *[INFERRED]* | No aparece en HTML medido |
| 4 | `2cbawi-0s5vzf.js` | 418.858 B (409,0 KB) | 133.559 B | **`jsPDF` + `html2canvas`** (pdf-utils) | **LAZY** ✅ |
| 5 | `3zk3bb69dmxey.js` | 263.870 B (257,7 KB) | 76.442 B | `katex` *[INFERRED]* | No aparece en HTML medido |
| 6 | `36ijlf6hma9fm.js` | 237.915 B (232,3 KB) | 70.335 B | `recharts` | **EAGER en `/ai/health`** ⚠️ |
| 7 | `0yfjhv3ebgnur.js` | 229.030 B (223,7 KB) | 71.473 B | `react-dom` (framework) | **EAGER en todas** (esperado) |
| 8 | `2d0rji8dmxh87.css` | 222.781 B (217,6 KB) | 29.898 B | CSS global | **EAGER en todas** ⚠️ |
| 9 | `19irr3q37y45i.js` | 214.518 B (209,5 KB) | 54.882 B | cliente `supabase` *[INFERRED]* | **EAGER en `/login`** ⚠️ |
| 10 | `19tnpn67abx19.js` | 210.832 B (205,9 KB) | 24.601 B | `katex` + `highlight` + sanitize *[INFERRED]* | No aparece en HTML medido |
| 11 | `1z9wa_774s3q2.js` | 198.037 B (193,4 KB) | 45.306 B | `html2canvas` (2ª copia) | **LAZY** ✅ |
| 12 | `169k76d6o_dh-.js` | 179.409 B (175,2 KB) | 40.921 B | `leaflet` | **LAZY** ✅ |

### 5.1 Estado de las dependencias pesadas conocidas

| Dependencia | Chunk(s) | Presente en el build | Eager en el HTML inicial | Verificación |
|---|---|---|---|---|
| `swagger-ui-react` | `1xby-pjphut2o` (1.133 KB) | ✅ sí | **No** en `/swagger` ni en ninguna ruta medida | Carga vía `s.l()` (dynamic import) desde `44gpoej18t2z0.js` |
| `html2canvas` + `jsPDF` | `2cbawi-0s5vzf` (409 KB) + `1z9wa_774s3q2` (193 KB) | ✅ sí | **No** en ninguna de las 11 rutas medidas | Stubs de loader en initial de `/p/[token]`, `/projects/.../audits/...`, `/intelligence`; descarga bajo demanda |
| `mermaid` | `2_8wuwaw531t_` (640 KB) | ✅ sí | **No** en ninguna ruta medida | Cadena lazy `3dai0df1kez3z → 1g56cd5kdcw7d → 0w3cvoqtwi979` |
| `leaflet` | `0rudprcas4g_2` (145 KB) + `169k76d6o_dh-` (175 KB) | ✅ sí | **No** en ninguna ruta medida | Lazy desde `3dai0df1kez3z.js` |
| `recharts` | 10 chunks; el mayor `36ijlf6hma9fm` (232 KB) | ✅ sí | **SÍ en `/ai/health`** (6 chunks en el HTML) ⚠️ | `async=false` en el manifest de `/ai/health`; lazy en el resto |
| `reactflow` / `@xyflow` | `39l9w03no01ao` (143 KB) | ✅ sí | **SÍ en `/intelligence`** según manifest (`async=false`) ⚠️ | HTML **[NO MEDIDO]**: la ruta redirige a `/login` sin sesión |
| `three` | — | ❌ no está en el build | n/a | N/A |
| `@react-pdf/renderer` | — | ❌ no está en el build | n/a | N/A |

**Método de verificación de lazy/eager:** (a) escaneo de contenido de **cada `<script>` servido en el HTML** contra firmas de la librería; (b) búsqueda del identificador de chunk en los `client-reference-manifest.js` con su flag `async`; (c) inspección del código del chunk emisor: todas las referencias a los chunks pesados aparecen dentro de `Promise.all([...].map(t => s.l(t)))`, es decir, **cargador asíncrono de Turbopack (dynamic import)**, no import estático.

---

## 6. Hallazgos y recomendaciones priorizadas

| # | Prioridad | Hallazgo | Evidencia | Recomendación | Estado |
|---|---|---|---|---|---|
| H-01 | **P0** | TBT de 1336 ms en `/login` y 857 ms en `/`; 6,1 s de trabajo en main thread | §3.1 | Dividir la hidratación del shell con `next/dynamic` + `<Suspense>` (pestañas del dashboard, copiloto) y reducir el trabajo sincrónico en el primer paint | ✅ 2026-10-01 — `NeuralNetworkBackground` (loop rAF canvas) diferido con `ssr:false` en `/`, `/login` y su skeleton; pestañas y copiloto ya lazy. TBT sin re-medir (→ H-08) |
| H-02 | **P0** | JS inicial de `/` = 1.026 KB raw / 316 KB gzip y de `/login` = 978 KB / 292 KB | §4.1 | Revisar por qué `/login` arrastra `19irr3q37y45i.js` (210 KB, cliente `supabase`) y evaluar moverlo a lazy si el login no lo necesita en el primer render | ✅ 2026-10-01 — supabase bajo `import()` en los handlers del login; HTML de `/login` sin `createBrowserClient` (18 scripts): **748,1 KB raw (−229,9 KB / −23,5%)**; `19irr3q37y45i.js` solo vía loader async |
| H-03 | **P1** | `recharts` **eager** en `/ai/health`: 6 chunks + 232 KB en el HTML inicial | §5.1 | Envolver los gráficos con `next/dynamic({ ssr:false, loading })` (patrón ya aplicado en `PerformanceTab`) | ✅ 2026-10-01 (lote PRE-PROD #3) |
| H-04 | **P1** | `reactflow` (143 KB) **eager** en `/intelligence` | manifest `async=false` | Confirmar y, si procede, pasar a carga diferida del grafo | ✅ 2026-10-01 — `TopologyView` lazy (lote PRE-PROD #3) |
| H-05 | **P1** | CSS global de **217,6 KB raw (29,2 KB gzip) en todas las rutas** | §4.1, §5 | Audit de utilidades no usadas (Tailwind) y separar CSS por ruta | ✅ 2026-10-01 — audit completo en §4.4: 97,7% de las utilities usadas por `src`; `@source not` (docs/tests/e2e) → global **222.781→218.814 B raw / 29.898→29.382 gzip9**; separación por ruta sin candidatos (vendor ya lazy) |
| H-06 | **P2** | Fuentes: **110 KB de transfer en las 4 rutas** | §3.2 | `font-display: swap`, `unicode-range`/subsetting, reducir familias (baseline ya lo señalaba) | ⬜ abierto |
| H-07 | **P2** | `/swagger` sigue con 610 KB de first-load JS (sin contar el chunk lazy de 1,13 MB) | §4.2 | Prefetch en hover del link a `/swagger` (recomendación 4 del reporte de julio, sigue abierta) | ⬜ abierto |
| H-08 | **P2** | No existe medición continua | §7 | Lighthouse CI en el pipeline + este informe por release para detectar regresiones de bundle | ⬜ abierto |

**REQ del baseline — estado actual:**

| REQ | Requisito | Estado 2026-09-26 |
|-----|-----------|--------|
| REQ-001 | LCP < 2,5 s en `/login` | 🔴 4,67 s (lab local) |
| REQ-002 | CLS = 0 | ✅ 0 en las 4 rutas |
| REQ-003 | TBT < 200 ms | 🔴 1336 ms en `/login` |
| REQ-004 | Ahorro de bundle verificado | ✅ baseline 2026-07-31 (409 KB × 2 rutas + 11 KB); **esta ronda re-verifica el estado lazy** |
| REQ-005 | Carga bajo demanda de librerías pesadas | ⚠️ 6/8 librerías lazy verificadas; `recharts` eager en `/ai/health` y `reactflow` eager en `/intelligence` |

---

## 7. Limitaciones y `[NO MEDIDO]`

| Elemento | Estado | Motivo |
|---|---|---|
| Producción (`scaudit.vercel.app`) | **[NO MEDIDO]** | La ronda se limitó a build + lab local; no se ejecutó Lighthouse contra producción |
| `/intelligence`, `/projects/[id]/audits/[auditId]` — HTML inicial | **[NO MEDIDO]** | Rutas con sesión: `307 → /login`; sólo se pudo leer su `client-reference-manifest` |
| HTML de `/ai/health` sin sesión | Medido ✅ | Ruta accesible; sirvió para detectar el `recharts` eager |
| INP | **[NO MEDIDO]** | Lighthouse lab no informa INP (métrica de campo); el baseline tampoco lo incluía |
| CWV de campo / RUM | **[NO MEDIDO]** | Fuera de alcance de esta ronda (Vercel Speed Insights + `/api/telemetry/vitals` no consultados) |
| Muestras pequeñas | Limitación | `/login` n=3; `/`, `/pricing`, `/docs` **n=2** (mediana de 2 = media). Se respetó el máximo de 9 invocaciones de Lighthouse |
| Comparabilidad con el baseline | Limitación | Baseline = producción (Vercel), nueva ronda = lab local. Las diferencias de score **no** miden regresión de código |
| Identificación de chunks | Limitación | La librería de los chunks 3, 5 y 10 del §5 se infiere por firmas de contenido: marcada *[INFERRED]*, no verificada en origen |
| Variabilidad | [ASSUMPTION] | Las mediciones lab varían ±10 % según CPU/carga de la máquina |

**Limpieza:** el servidor `next start` (puerto 3100) fue **terminado** al final de la sesión; los JSON de Lighthouse y scripts de medición se crearon en el directorio temporal del sistema y **no** forman parte del repositorio.

---

*Reporte generado el 2026-09-26 con Lighthouse 13.5.0 (lab local) y análisis de artefactos de build de Turbopack (Next.js 16.3.3). Baseline histórico: reporte del 2026-07-31 (Lighthouse 13.4.1 contra producción).*
