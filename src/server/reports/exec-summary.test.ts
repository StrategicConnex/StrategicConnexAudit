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
        issue({ severity: 'info', id: 'i3', category: 'link' }), // -1, cubre categoryDist.link
      ],
      priorAudit: { id: 'a0', completedAt: new Date('2026-09-12'), score: 90 },
      priorIssues: [issue({ id: 'p1', title: 'Viejo', category: 'link' })],
      fixedIssuesCount: 2,
      priorScores: [{ date: '2026-09-12', score: 90 }, { date: '2026-08-01', score: 85 }],
      audience: 'internal',
    };
    const s = reduceExecSummary(input);
    expect(s.healthScore).toBe(86);           // 100-14
    expect(s.verdict).toBe('ok');             // 86 >= 75 (correccin del plan: el boceto decía 'warn')
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
    expect(s.resolvedIssues).toBe(5);
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
