import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PerformanceSnapshot } from './performance';

const USER_ID = '22222222-2222-4222-a222-222222222222';
const P1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const P2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const A1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const { state, mockGetUser, mockLogger } = vi.hoisted(() => {
  const state = {
    queue: [] as unknown[][],
    selectCalls: 0,
  };
  const mockGetUser = vi.fn();
  const mockLogger = {
    info: vi.fn(async () => undefined),
    error: vi.fn(async () => undefined),
    warn: vi.fn(async () => undefined),
    security: vi.fn(async () => undefined),
  };
  return { state, mockGetUser, mockLogger };
});

function makeQuery(result: unknown[]) {
  const q: Record<string, unknown> = {};
  const self = () => q;
  q.from = self;
  q.where = self;
  q.orderBy = self;
  q.groupBy = self;
  q.limit = vi.fn(async () => result);
  q.then = (resolve: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return q;
}

vi.mock('@/shared/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock('@/shared/db/rls', () => ({
  withRLS: vi.fn(async (_userId: string, cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      select: vi.fn(() => {
        state.selectCalls += 1;
        const next = state.queue.shift() ?? [];
        return makeQuery(next);
      }),
    }),
  ),
}));

vi.mock('@/shared/lib/logger', () => ({ logger: mockLogger }));

import { getPerformanceSnapshot } from './performance';

beforeEach(() => {
  state.queue = [];
  state.selectCalls = 0;
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
});

describe('getPerformanceSnapshot', () => {
  it('sin proyectos → snapshot vacío con 1 sola query', async () => {
    state.queue = [[]];

    const result = await getPerformanceSnapshot({});

    expect(result.error).toBeUndefined();
    const snapshot = result.data as PerformanceSnapshot;
    expect(snapshot.overallScore).toBeNull();
    expect(snapshot.projects).toEqual([]);
    expect(snapshot.vitals.sampleCount).toBe(0);
    expect(snapshot.vitals.sparkline).toHaveLength(9);
    expect(snapshot.vitals.sparkline.every((b) => b.v === null)).toBe(true);
    expect(state.selectCalls).toBe(1);
  });

  it('agrega vitals + scores con 4 queries (sin N+1) y fórmula correcta', async () => {
    const now = Date.now();
    const inWindow = (minutesAhead: number) => new Date(now - 30 * 60_000 + minutesAhead * 60_000 + 60_000);

    state.queue = [
      // 1. proyectos
      [{ id: P1 }, { id: P2 }],
      // 2. web_vitals_logs (ventana 30 min)
      [
        { lcp: 2000, cls: 0.05, inp: 150, recordedAt: inWindow(1) },
        { lcp: 3000, cls: 0.2, inp: 260, recordedAt: inWindow(5) },
      ],
      // 3. auditorías: P1 tiene completed + running más nueva; P2 ninguna
      [
        { id: 'a2-running', projectId: P1, status: 'running', createdAt: new Date(now) },
        { id: A1, projectId: P1, status: 'completed', createdAt: new Date(now - 1000) },
      ],
      // 4. issues de A1
      [
        { auditId: A1, severity: 'critical', n: 2 },
        { auditId: A1, severity: 'warning', n: 4 },
      ],
    ];

    const result = await getPerformanceSnapshot({});
    expect(result.error).toBeUndefined();
    const snapshot = result.data as PerformanceSnapshot;

    // Vitals: medias de [2000,3000] / [0.05,0.2] / [150,260]
    expect(snapshot.vitals.lcpMs).toBe(2500);
    expect(snapshot.vitals.lcpStatus).toBe('good');
    expect(snapshot.vitals.cls).toBeCloseTo(0.125, 3);
    expect(snapshot.vitals.clsStatus).toBe('needs_improvement');
    expect(snapshot.vitals.inpMs).toBeCloseTo(205, 3);
    expect(snapshot.vitals.inpStatus).toBe('needs_improvement');
    expect(snapshot.vitals.sampleCount).toBe(2);
    expect(snapshot.vitals.sparkline).toHaveLength(9);
    expect(snapshot.vitals.sparkline.filter((b) => b.v !== null)).toHaveLength(2);

    // Scores: P1 = 100 - 2*15 - 4*5 = 50 (crítico); P2 sin auditoría → null
    const byId = Object.fromEntries(snapshot.projects.map((p) => [p.id, p.score]));
    expect(byId[P1]).toBe(50);
    expect(byId[P2]).toBeNull();
    expect(snapshot.assessedProjects).toBe(1);
    expect(snapshot.overallScore).toBe(50);
    expect(snapshot.healthSegments).toEqual({ critical: 1, warning: 0, good: 0 });

    // Sin N+1: projects, vitals, audits, issues = exactamente 4 selects
    expect(state.selectCalls).toBe(4);
  });

  it('ventana sin eventos RUM → vitals en null pero scores reales', async () => {
    state.queue = [
      [{ id: P1 }],
      [], // sin vitals
      [{ id: A1, projectId: P1, status: 'completed', createdAt: new Date() }],
      [{ auditId: A1, severity: 'warning', n: 3 }],
    ];

    const result = await getPerformanceSnapshot({});
    const snapshot = result.data as PerformanceSnapshot;

    expect(snapshot.vitals.lcpMs).toBeNull();
    expect(snapshot.vitals.lcpStatus).toBeNull();
    expect(snapshot.vitals.sampleCount).toBe(0);
    expect(snapshot.overallScore).toBe(85); // 100 - 3*5
    expect(snapshot.healthSegments).toEqual({ critical: 0, warning: 0, good: 1 });
  });

  it('sin sesión → error de autorización', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('no session') });

    const result = await getPerformanceSnapshot({});

    expect(result.data).toBeUndefined();
    expect(result.error).toMatch(/autorizado/i);
    expect(state.selectCalls).toBe(0);
  });
});
