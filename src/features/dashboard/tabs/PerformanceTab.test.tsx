import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { PerformanceTab } from './PerformanceTab';
import type { PerformanceSnapshot } from '@/app/actions/performance';
import type { ProjectRow } from '@/shared/db/types';

const getSnapshotMock = vi.hoisted(() => vi.fn());

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children }: { children?: React.ReactNode }) => <svg>{children}</svg>,
  Area: () => null,
  PieChart: ({ children }: { children?: React.ReactNode }) => <svg>{children}</svg>,
  Pie: () => null,
  Cell: () => null,
}));

vi.mock('@/app/actions/performance', () => ({
  getPerformanceSnapshot: (...args: unknown[]) => getSnapshotMock(...args),
}));

function ok(data: PerformanceSnapshot) {
  return { data, error: undefined };
}

const DATA_SNAPSHOT: PerformanceSnapshot = {
  updatedAt: '2026-09-25T12:00:00.000Z',
  windowMinutes: 30,
  vitals: {
    lcpMs: 2400,
    cls: 0.05,
    inpMs: 210,
    lcpStatus: 'good',
    clsStatus: 'good',
    inpStatus: 'needs_improvement',
    sparkline: Array.from({ length: 9 }, (_, i) => ({ v: i === 0 ? null : 180 + i })),
    sampleCount: 42,
  },
  overallScore: 91.4,
  assessedProjects: 1,
  healthSegments: { critical: 1, warning: 0, good: 2 },
  projects: [
    { id: 'p1', score: 95 },
    { id: 'p2', score: null },
  ],
};

const EMPTY_SNAPSHOT: PerformanceSnapshot = {
  updatedAt: '2026-09-25T12:00:00.000Z',
  windowMinutes: 30,
  vitals: {
    lcpMs: null,
    cls: null,
    inpMs: null,
    lcpStatus: null,
    clsStatus: null,
    inpStatus: null,
    sparkline: Array.from({ length: 9 }, () => ({ v: null })),
    sampleCount: 0,
  },
  overallScore: null,
  assessedProjects: 0,
  healthSegments: { critical: 0, warning: 0, good: 0 },
  projects: [],
};

const PROJECTS = [
  { id: 'p1', name: 'Proyecto A', domain: 'a.com' },
  { id: 'p2', name: 'Proyecto B', domain: 'b.com' },
] as unknown as ProjectRow[];

describe('PerformanceTab — datos reales desde getPerformanceSnapshot', () => {
  beforeEach(() => {
    getSnapshotMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('renderiza vitals, score y por proyecto desde el snapshot', async () => {
    getSnapshotMock.mockResolvedValue(ok(DATA_SNAPSHOT));
    render(<PerformanceTab dashboardData={PROJECTS} />);

    await waitFor(() => {
      expect(screen.getByText('pageTitle')).toBeTruthy();
    });

    // Badge RUM real (ya no "LIVE · Active Monitor") y ventana honesta
    expect(screen.getByText('rumBadge')).toBeTruthy();
    expect(screen.queryByText('liveBadge')).toBeNull();

    // Valores de vitals reales (cada valor aparece en card + footer)
    expect(screen.getAllByText('2.4s').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('0.05').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('210ms').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('statusNeedsImprovement').length).toBeGreaterThan(0);

    // Índice/score real (no 91.4 hardcodeado en todas partes)
    expect(screen.getAllByText(/91.4/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/94/)).toBeNull();

    // Segmentos de salud reales con conteos
    expect(screen.getByText(/legendCritical/)).toBeTruthy();
    expect(screen.getByText(/legendGood/)).toBeTruthy();

    // Proyectos con score real del snapshot
    expect(screen.getByText('Proyecto A')).toBeTruthy();
    expect(screen.getByText('95/100')).toBeTruthy();
    expect(screen.getByText('healthy')).toBeTruthy();
    expect(screen.getByText('Proyecto B')).toBeTruthy();
    expect(screen.getByText('projectsNoData')).toBeTruthy();

    expect(getSnapshotMock).toHaveBeenCalledTimes(1);
  });

  it('estado vacío: sin eventos RUM muestra noDataHint y sin segmentos', async () => {
    getSnapshotMock.mockResolvedValue(ok(EMPTY_SNAPSHOT));
    render(<PerformanceTab dashboardData={PROJECTS} />);

    await waitFor(() => {
      expect(screen.getAllByText('noDataHint').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText('noData').length).toBeGreaterThan(0);
    expect(screen.queryByText('healthy')).toBeNull();
    expect(screen.getAllByText('projectsNoData').length).toBe(2);
  });

  it('Sync vuelve a llamar a la acción', async () => {
    getSnapshotMock.mockResolvedValue(ok(DATA_SNAPSHOT));
    render(<PerformanceTab dashboardData={PROJECTS} />);

    await waitFor(() => {
      expect(screen.getByText('syncButton')).toBeTruthy();
    });
    expect(getSnapshotMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('syncButton'));
    await waitFor(() => {
      expect(getSnapshotMock).toHaveBeenCalledTimes(2);
    });
  });

  it('error de carga se muestra en la tarjeta de error', async () => {
    getSnapshotMock.mockResolvedValue({ data: null, error: 'boom-db' });
    render(<PerformanceTab dashboardData={PROJECTS} />);

    await waitFor(() => {
      expect(screen.getByText('boom-db')).toBeTruthy();
    });
  });
});
