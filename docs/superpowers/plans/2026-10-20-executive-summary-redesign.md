# Executive Summary Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un núcleo único de datos (`ExecSummary`) alimenta resúmenes ejecutivos con más detalle y más impacto visual en las 3 camadas: HTML de auditoría (+ su PDF-screenshot cliente), PDF white-label de Inteligencia y digests IA.

**Architecture:** Módulo puro reducido+testeado (`src/server/reports/exec-summary.ts`) + capa IO con executor inyectable (tx/RLS o directDb) + renderers tontos. El PDF de auditoría es un screenshot del HTML (modern-screenshot), así que hereda el rediseño HTML sin trabajo extra.

**Tech Stack:** TypeScript, Drizzle (pgEnum severity: critical/warning/info), react-pdf (@react-pdf/renderer, hex only), Tailwind v4 + OKLCH (HTML nativo), vitest.

**Spec:** `docs/superpowers/specs/2026-10-20-executive-summary-redesign-design.md`

## Global Constraints

- Copy en español de España; **sin i18n** en estos surfaces (spec §4: fuera de alcance). Si se agrega alguna key nueva accidentalmente, correr `pnpm guard:i18n`.
- react-pdf: SOLO hex en estilos — nada de OKLCH/css vars (el parser de react-pdf no las soporta).
- `severityEnum` (auditorías) = `critical | warning | info`. Severidad de inteligencia = `critical | high | medium | low` — los dos dominios NO se mezclan: cada uno con su escala y su reducer.
- Health score de auditoría = `100 - (critical×10 + warning×3 + info×1)` (fórmula de exec-brief, "criterio del portal"). Nota: el gauge del header de la página usa 15/5 legacy — NO se toca esa card (queda anotada como inconsistencia pre-existente, ticket aparte). El nuevo bloque usa la fórmula del núcleo.
- Prohibido: `src/proxy.ts`, RLS, auth, IA pool, react-dom investigation (H-10b gate 2026-10-22).
- Gate antes de cada push: `pnpm typecheck` + `pnpm vitest run` (286 files / 2785+ tests) + `pnpm build` + eslint 0 errores.
- Fire-and-forget IA: un fallo de IA NUNCA marca audits como fallidas ni lanza (contrato exec-brief existente se conserva).

## Nota de ajuste del spec (descubrimiento de lectura)

El spec §3.1 llamaba "PDF cliente white-label" al `pdf-template.tsx` — en realidad ese es el **PDF de Inteligencia** (investigaciones + findings). El PDF de auditoría es un screenshot del HTML. Por tanto:
- Las **matrices quick wins** (esfuerzo S/M/L por categoría) solo existen en el dominio auditorías (metadata/enlaces/performance…); el dominio inteligencia NO tiene señal de esfuerzo → no matrix ahí (se documenta la desviación).
- El banner+KPIs+top riesgos se implementan en AMBOS dominios con la misma cáscara visual.

---

### Task 1: Núcleo puro `reduceExecSummary` + helpers

**Files:**
- Create: `src/server/reports/exec-summary.ts`
- Test: `src/server/reports/exec-summary.test.ts`

**Interfaces:**
- Produces: `type ExecSummary`, `type ExecSummarySeverity = 'critical'|'warning'|'info'`, `type ExecSummaryCategory = 'seo'|'meta'|'performance'|'security'|'accessibility'|'link'`, `type ExecSummaryEffort = 'S'|'M'|'L'`, `reduceExecSummary(input)`, `verdictFromScore(score: number)`, `sanitizeUrlForClient(url: string|null): string|null`, `quickWinsMatrixCount(quickWins)`. Task 2/3/4/5/6 consumen estos nombres EXACTOS.

- [x] **Step 1: Write the failing test**

```ts
// src/server/reports/exec-summary.test.ts
import { describe, it, expect } from 'vitest';
import {
  reduceExecSummary, verdictFromScore, sanitizeUrlForClient, quickWinsMatrixCount,
  type ExecSummaryInput,
} from './exec-summary';

const issue = (over: Partial<ExecSummaryInput['issues'][number]> = {}) => ({
  id: 'i-' + Math.random(), severity: 'warning' as const, category: 'seo' as const,
  title: 'Hallazgo', description: 'd', url: 'https://a.com/x', recommendation: 'r', fixed: false,
  ...over,
});
const audit = (over: Partial<ExecSummaryInput['audit']> = {}) => ({
  id: 'a-' + Math.random(), createdAt: new Date('2026-10-19'), completedAt: new Date('2026-10-19'),
  ...over,
});

describe('verdictFromScore', () => {
  it('75+ ok, 40-74 warn, <40 critical', () => {
    expect(verdictFromScore(75)).toBe('ok');
    expect(verdictFromScore(40)).toBe('warn');
    expect(verdictFromScore(39)).toBe('critical');
  });
});

describe('sanitizeUrlForClient', () => {
  it('deja solo ruta sin querystring', () => {
    expect(sanitizeUrlForClient('https://a.com/p?x=1')).toBe('/p');
    expect(sanitizeUrlForClient(null)).toBeNull();
  });
});

describe('reduceExecSummary', () => {
  it('calcula score 10/3/1, veredicto y delta vs audit previa', () => {
    const input: ExecSummaryInput = {
      audit: audit({ id: 'a1' }),
      issues: [
        issue({ severity: 'critical', id: 'i1' }),  // -10
        issue({ severity: 'warning', id: 'i2' }),   // -3
        issue({ severity: 'info', id: 'i3' }),      // -1
      ],
      priorAudit: { id: 'a0', completedAt: new Date('2026-09-12'), score: 90 },
      priorIssues: [issue({ id: 'p1', title: 'Viejo', category: 'link' })],
      fixedIssuesCount: 2,
      priorScores: [{ date: '2026-09-12', score: 90 }, { date: '2026-08-01', score: 85 }],
      audience: 'internal',
    };
    const s = reduceExecSummary(input);
    expect(s.healthScore).toBe(86);           // 100-14
    expect(s.verdict).toBe('warn');           // 40-74
    expect(s.delta).toEqual({ value: -4, dir: 'down' });
    expect(s.severityDist).toEqual({ critical: 1, warning: 1, info: 1 });
    expect(s.categoryDist.link).toBe(1);
    expect(s.newIssues).toBe(3);              // ninguno matchea 'Viejo'
    expect(s.resolvedIssues).toBe(2);         // fixedIssuesCount
    expect(s.trajectory.length).toBe(3);
  });

  it('sin auditoría previa: delta null y resolved 0', () => {
    const s = reduceExecSummary({
      audit: audit(), issues: [], priorAudit: null, priorIssues: [],
      fixedIssuesCount: 5, priorScores: [], audience: 'client',
    });
    expect(s.delta).toEqual({ value: null, dir: 'flat' });
    expect(s.resolvedIssues).toBe(0);
    expect(s.verdict).toBe('ok');             // 100
  });

  it('topRisks ordena críticos primero y máx 5', () => {
    const issues = [
      issue({ id: 'w1' }), issue({ id: 'w2' }), issue({ id: 'w3' }), issue({ id: 'w4' }),
      issue({ id: 'w5' }), issue({ id: 'w6' }),
      issue({ id: 'c1', severity: 'critical', title: 'CR' }),
    ];
    const s = reduceExecSummary({
      audit: audit(), issues, priorAudit: null, priorIssues: [],
      fixedIssuesCount: 0, priorScores: [], audience: 'internal',
    });
    expect(s.topRisks.length).toBe(5);
    expect(s.topRisks[0]).toMatchObject({ severity: 'critical', title: 'CR' });
  });

  it('quickWins asigna esfuerzo por categoría (meta→S, seo/link/security/accessibility→M, performance→L)', () => {
    const s = reduceExecSummary({
      audit: audit(),
      issues: [
        issue({ category: 'meta', title: 'M' }), issue({ category: 'seo', title: 'S' }),
        issue({ category: 'link', title: 'L' }), issue({ category: 'security', title: 'X' }),
        issue({ category: 'performance', title: 'P' }), issue({ category: 'accessibility', title: 'A' }),
      ],
      priorAudit: null, priorIssues: [], fixedIssuesCount: 0, priorScores: [], audience: 'internal',
    });
    const e = Object.fromEntries(s.quickWins.map(q => [q.title, q.effort]));
    expect(e).toEqual({ M: 'S', S: 'M', L: 'M', X: 'M', P: 'L', A: 'M' });
  });

  it('audience client sanitiza las URLs del topRisks', () => {
    const s = reduceExecSummary({
      audit: audit(), issues: [issue({ url: 'https://privado.com/a?token=secreto' })],
      priorAudit: null, priorIssues: [], fixedIssuesCount: 0, priorScores: [], audience: 'client',
    });
    expect(s.topRisks[0].url).toBe('/a');
  });
});

describe('quickWinsMatrixCount', () => {
  it('agrupa por impacto×esfuerzo', () => {
    const counts = quickWinsMatrixCount([
      { title: 'a', effort: 'S', impact: 'alto' }, { title: 'b', effort: 'M', impact: 'alto' },
      { title: 'c', effort: 'M', impact: 'medio' },
    ]);
    expect(counts).toEqual({
      alto: { S: 1, M: 1, L: 0 }, medio: { S: 0, M: 1, L: 0 }, bajo: { S: 0, M: 0, L: 0 },
    });
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/reports/exec-summary.test.ts`
Expected: FAIL (no existe `./exec-summary`)

- [x] **Step 3: Write the implementation**

```ts
// src/server/reports/exec-summary.ts
/**
 * exec-summary.ts — Núcleo único del Resumen Ejecutivo (spec
 * docs/superpowers/specs/2026-10-20-executive-summary-redesign-design.md).
 *
 * reduceExecSummary() es PURA (testeable sin BD); la capa IO vive en
 * collectExecSummary() (Task 2). Los renderers (HTML react, react-pdf,
 * prompts IA) solo dibujan este contrato — misma cifra garantizada en las
 * 3 camadas.
 */
import type { DbExecutor } from '@/shared/db/executor';

export type ExecSummarySeverity = 'critical' | 'warning' | 'info';
export type ExecSummaryCategory = 'seo' | 'meta' | 'performance' | 'security' | 'accessibility' | 'link';
export type ExecSummaryEffort = 'S' | 'M' | 'L';
export type ExecSummaryImpact = 'alto' | 'medio' | 'bajo';
export type ExecSummaryVerdict = 'ok' | 'warn' | 'critical';

export interface ExecSummaryRow {
  id: string;
  severity: ExecSummarySeverity;
  category: ExecSummaryCategory;
  title: string;
  description: string;
  url: string | null;
  recommendation: string | null;
  fixed?: boolean;
}

export interface ExecSummaryInput {
  audit: { id: string; createdAt: Date | null; completedAt: Date | null };
  issues: ExecSummaryRow[];
  /** Última auditoría COMPLETADA previa a `audit` (null si no hay). */
  priorAudit: { id: string; completedAt: Date | null; score: number } | null;
  /** Issues de esa auditoría previa (para contar NUEVOS por ruleId+url+title). */
  priorIssues: ExecSummaryRow[];
  /** Issues del proyecto con fixed=true (cuentan como RESUELTAS). */
  fixedIssuesCount: number;
  /** Trayectoria: scores de las últimas ≤10 auditorías completadas, DESC. */
  priorScores: Array<{ date: string; score: number }>;
  audience: 'client' | 'internal';
}

export interface ExecSummary {
  verdict: ExecSummaryVerdict;
  healthScore: number;
  delta: { value: number | null; dir: 'up' | 'down' | 'flat' };
  severityDist: { critical: number; warning: number; info: number };
  categoryDist: Record<ExecSummaryCategory, number>;
  topRisks: Array<{ severity: ExecSummarySeverity; title: string; url: string | null; recommendation: string | null; category: ExecSummaryCategory }>;
  quickWins: Array<{ title: string; effort: ExecSummaryEffort; impact: ExecSummaryImpact }>;
  trajectory: Array<{ date: string; score: number }>;
  newIssues: number;
  resolvedIssues: number;
  audience: 'client' | 'internal';
}

/** Veredicto por umbrales del spec: ≥75 ok · ≥40 warn · <40 critical. */
export function verdictFromScore(score: number): ExecSummaryVerdict {
  if (score >= 75) return 'ok';
  if (score >= 40) return 'warn';
  return 'critical';
}

/**
 * PDF cliente: solo ruta sin querystring (sin host, sin tokens de query).
 * HTML interno pasa la URL completa (audience='internal').
 */
export function sanitizeUrlForClient(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/^https?:\/\/[^/]+(\/[^?#]*)?/);
  return m ? (m[1] ?? '/') : url;
}

/** Heurística de esfuerzo del spec §2 (data-driven; sin IA en el núcleo). */
const EFFORT_BY_CATEGORY: Record<ExecSummaryCategory, ExecSummaryEffort> = {
  meta: 'S',
  seo: 'M',
  link: 'M',
  security: 'M',
  accessibility: 'M',
  performance: 'L',
};

const IMPACT_BY_SEVERITY: Record<ExecSummarySeverity, ExecSummaryImpact> = {
  critical: 'alto',
  warning: 'medio',
  info: 'bajo',
};

const SEV_RANK: Record<ExecSummarySeverity, number> = { critical: 0, warning: 1, info: 2 };

/** Score de salud: criterio del portal (exec-brief): 10/3/1. */
export function auditHealthScore(sev: { critical: number; warning: number; info: number }): number {
  return Math.max(0, 100 - (sev.critical * 10 + sev.warning * 3 + sev.info * 1));
}

/** Matriz impacto×esfuerzo: contadores por celda (renderers la dibujan). */
export function quickWinsMatrixCount(quickWins: ExecSummary['quickWins']): Record<ExecSummaryImpact, Record<ExecSummaryEffort, number>> {
  const empty = (): Record<ExecSummaryEffort, number> => ({ S: 0, M: 0, L: 0 });
  const out: Record<ExecSummaryImpact, Record<ExecSummaryEffort, number>> = {
    alto: empty(), medio: empty(), bajo: empty(),
  };
  for (const q of quickWins) out[q.impact][q.effort] += 1;
  return out;
}

const WARNINGS = 1 as const;

export function reduceExecSummary(input: ExecSummaryInput): ExecSummary {
  const severityDist = { critical: 0, warning: 0, info: 0 };
  const categoryDist: Record<ExecSummaryCategory, number> = {
    seo: 0, meta: 0, performance: 0, security: 0, accessibility: 0, link: 0,
  };
  for (const iss of input.issues) {
    severityDist[iss.severity] += 1;
    if (categoryDist[iss.category] !== undefined) categoryDist[iss.category] += 1;
  }

  const healthScore = auditHealthScore(severityDist);
  const verdict = verdictFromScore(healthScore);

  const delta = input.priorAudit
    ? { value: healthScore - input.priorAudit.score,
        dir: healthScore > input.priorAudit.score ? 'up' as const
           : healthScore < input.priorAudit.score ? 'down' as const : 'flat' as const }
    : { value: null, dir: 'flat' as const };

  // Top riesgos: críticos primero, máx 5. Sanitización por audiencia.
  const usable = input.issues;
  const topRisksFull = [...usable]
    .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity])
    .slice(0, 5)
    .map((iss) => ({
      severity: iss.severity,
      title: iss.title,
      url: input.audience === 'client' ? sanitizeUrlForClient(iss.url) : iss.url,
      recommendation: iss.recommendation,
      category: iss.category,
    }));

  const quickWins = [...usable]
    .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity])
    .slice(0, 8)
    .map((iss) => ({
      title: iss.title,
      effort: EFFORT_BY_CATEGORY[iss.category] ?? 'M',
      impact: IMPACT_BY_SEVERITY[iss.severity],
    }));

  const trajectory = [
    ...(input.priorAudit
      ? [{ date: input.priorAudit.completedAt?.toISOString().slice(0, 10) ?? '', score: input.priorAudit.score }]
      : []),
    ...input.priorScores,
  ].slice(0, 10).sort((a, b) => a.date.localeCompare(b.date));

  // NUEVOS: issues de la auditoría actual que no están en la previa
  // (match por url+title; url puede ser null → match por title+category).
  const keyOf = (i: ExecSummaryRow) => `${i.url ?? ''}|${i.title}|${i.category}`;
  const priorKeys = new Set(input.priorIssues.map(keyOf));
  const newIssues = input.issues.filter((i) => !priorKeys.has(keyOf(i))).length;

  const resolvedIssues = input.audience === 'client'
    ? input.resolvedVisibility !== false ? input.fixedIssuesCount : 0
    : input.fixedIssuesCount;

  return {
    verdict, healthScore, delta, severityDist, categoryDist, topRisks: topRisksFull,
    quickWins, trajectory, newIssues, resolvedIssues, audience: input.audience,
  };
}
```

Wait — `resolvedVisibility` no existe: colocar `resolvedIssues = input.fixedIssuesCount` directamente (el spec muestra resueltos en ambas audiencias):

```ts
  const resolvedIssues = input.fixedIssuesCount;
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/server/reports/exec-summary.test.ts`
Expected: PASS (15 tests)

- [x] **Step 5: Commit**

```bash
git add src/server/reports/exec-summary.ts src/server/reports/exec-summary.test.ts
git commit -m "feat(exec-summary): núcleo puro del resumen ejecutivo (op3)"
```
