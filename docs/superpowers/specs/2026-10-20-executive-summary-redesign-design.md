# Spec — Rediseño del Resumen Ejecutivo (3 camadas)

**Fecha:** 2026-10-20 · **Estado:** aprobado por owner (diseño en conversación)
**Alcance:** PDF white-label + página HTML de detalle de auditoría + digests IA
**Decisión de enfoque:** Enfoque A — núcleo único de datos + 3 renderers (descartados B ad-hoc y C rediseño máximo)

## 1. Problema

Los tres «Resumen Ejecutivo» del producto hablan del mismo dato con idiomas distintos:

| Surface | Hoy |
|---|---|
| HTML (`src/app/projects/[id]/audits/[auditId]/page.tsx`) | Infografía por **categoría** + SERP; sin severidades, sin veredicto, sin delta histórico, sin top riesgos |
| PDF white-label (`src/server/reports/pdf-template.tsx`, `OverviewPage`) | 1 línea de texto + donut de severidad + barras por score |
| Digests IA (`exec-brief`, `weekly-digest`, Incident Brief, reporte SEO) | Contadores crudos + 3 párrafos genéricos; cada uno improvisa sus números |

**Objetivo del owner:** más información detallada + más impacto visual, con **misma cifras garantizadas** en las 3 camadas.

## 2. Núcleo de datos — `src/server/reports/exec-summary.ts`

Función **pura** `reduceExecSummary(audit, issues, priorAudits) -> ExecSummary` + capa IO separada (consulta con el mismo tx/authorization del llamante). Contrato:

```ts
interface ExecSummary {
  verdict: 'ok' | 'warn' | 'critical';      // score ponderado: ≥75 ok · ≥40 warn · <40 critical
  healthScore: number;                       // 0-100, misma fórmula que exec-brief usa hoy
  delta: { value: number | null; dir: 'up' | 'down' | 'flat' };  // vs última auditoría completada previa
  severityDist: { critical: number; warning: number; info: number };
  categoryDist: Record<'seo' | 'meta' | 'performance' | 'security' | 'accessibility' | 'link', number>;
  topRisks: Array<{ severity; title; url; recommendation; category }>;  // máx 5, crit > warn > info
  quickWins: Array<{ title; effort: 'S' | 'M' | 'L'; impact: 'alto' | 'medio' | 'bajo' }>;
  trajectory: Array<{ date: string; score: number }>;  // últimas ≤10 auditorías completadas
  newIssues: number; resolvedIssues: number; // vs auditoría previa (match ruleId+url+title;
                                             //  issues con fixed=true cuentan como resueltos)
  audience: 'client' | 'internal';           // determina qué campos nullifica el renderer PDF
}
```

**Heurística de esfuerzo (determinística, sin IA):**
- `S` (quick win): correcciones de metadata (title, meta description, etc.)
- `M`: SEO estructural (H1/H2, enlaces rotos, contenido escaso)
- `L`: performance/arquitectura (profundidad de rastreo, infraestructura)
- `impact` = severidad del hallazgo (critical→alto, warning→medio, info→bajo)

**Sanitización por audiencia:** con `audience='client'` el renderer PDF oculta URLs absolutas (solo rutas sin querystring) y cualquier dato interno; `internal` muestra URL completa.

## 3. Renderers

### 3.1 PDF cliente — Opción A (aprobada con mockup)

Composición nueva de `OverviewPage` (se mantienen donut y barras existentes):

1. **Banner veredicto** full-width: semáforo + frase de negocio + línea de contexto (hallazgos, críticos, score, delta)
2. **Fila de 4 KPI cards**: Salud general / Δ vs anterior (▲▼ con color) / Críticos abiertos / Quick wins disponibles
3. **Fila media**: donut de severidad (existente) + **tabla Top 5 riesgos** (chip de severidad + hallazgo + zona)
4. **Matriz impacto × esfuerzo** (3 columnas: HACER YA / PLANIFICAR / PRESUPUESTAR con contadores)

Paleta: tokens hex del `THEME` existente del PDF (nada de OKLCH en react-pdf).

### 3.2 HTML interno — mockup #4 aprobado (añadidos sin destruir lo existente)

Se añade a la Sección 1 «Resumen Ejecutivo» de la página de detalle, en este orden, **antes** de lo existente:

1. **Banner veredicto** veredicto (score + Δ + críticos + quick wins + nuevos/resueltos)
2. **Card severidad** (donut CSS, hoy solo hay por categoría) + **Top riesgos técnicos con URL completa** en `<code>`
3. **Matriz quick wins interactiva**: celda filtra las issues de abajo
4. Se conservan intactos: mini-bars de categoría, simulador SERP, métricas y las 2 tarjetas de Distribución/Infografía

Estilo: tokens `glass-card` + identidad NOC oliva/dorado/teal existente; dark-first.

### 3.3 Digests IA

Todos los prompts reciben el mismo `ExecSummary`:

| Digest | Cambio |
|---|---|
| `exec-brief.ts` | Prompt enriquecido (veredicto, delta, topRisks con URL+recomendación, quickWins, tendencia, nuevos/resueltos). JSON de salida extendido con `quickWinCallout` + `businessImpact` por riesgo (campos **opcionales**) |
| `weekly-digest.trigger.ts` | Tabla comparativa semanal: score+delta, nuevos vs resueltos, estado persistente de los 3 topRisks |
| Incident Brief (`api/intelligence/brief` + `IncidentBriefModal`) | La sección «Resumen Ejecutivo» abre con veredicto+score+delta inyectados por el núcleo |
| `seo-report-service.ts` | La sección «🏢 Resumen Ejecutivo» abre con veredicto+KPIs; la IA narra sobre datos fijos |

**Compatibilidad:** briefs persistidos en `exec_briefs` no cambian de forma; campos nuevos opcionales, parser tolerante con fallback al texto actual si la IA no devuelve la forma nueva (fallback Groq/Gemini intacto).

## 4. Fuera de alcance

- i18n de estos surfaces (hoy ES-only)
- Cambios de esquema de tablas (todo cabe en jsonb / usa `issues.fixed`)
- Tocar el pipeline OKLCH→PDF (modern-screenshot ya validado)
- Modificar coordenadas fijas dinámicas (react-dom chunk C) — se rige por H-10b

## 5. Verificación (evidencia antes de DONE)

1. **Unidad** `exec-summary.test.ts`: score, delta, umbrales de veredicto, topRisks ordenado, heurística S/M/L, resueltos por `fixed=true`, corners (0 hallazgos, 1 sola auditoría, todo crítico)
2. **Prompt-builders**: test de inyección del JSON + tolerancia a campos ausentes
3. **Visual**: screenshot del HTML con fixture; PDF generado con fixture para inspección del owner antes del push
4. **Gate completo**: typecheck + eslint 0 errores + suite completa (+2.785 tests hoy) + `pnpm build` Turbopack antes de cada push

## 6. Decisiones registradas en la conversación

- Audiencia: **doble instancia** — PDF cliente no técnico; HTML interno + digests con detalle técnico
- Bloques: veredicto+delta · top riesgos · matriz quick wins · trayectoria+nuevos/resueltos (los 4)
- Enfoque: A (núcleo único) sobre B y C
- PDF: Opción A · HTML: mockup #4
