'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ListChecks,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  Ban,
} from 'lucide-react';
import { logger } from '@/lib/logger';
import { formatDateTime } from '@/shared/utils/datetime';

type FindingStatus =
  | 'open'
  | 'acknowledged'
  | 'in_progress'
  | 'resolved'
  | 'false_positive'
  | 'accepted_risk';

type FindingSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

interface BoardFinding {
  id: string;
  projectId: string;
  title: string;
  description: string;
  severity: FindingSeverity;
  status: FindingStatus;
  assigneeId: string | null;
  slaHours: number | null;
  dueAt: string | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  suppressedUntil: string | null;
  suppressedReason: string | null;
  affectedAsset: string | null;
  aiTriage: Record<string, unknown> | null;
  createdAt: string | null;
  overdue: boolean;
}

interface TriageResponse {
  success: boolean;
  findings: BoardFinding[];
  statuses: FindingStatus[];
  transitions: Record<FindingStatus, FindingStatus[]>;
}

interface TriageTabProps {
  initialProjects: Array<{ id: string; name: string }>;
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
}

/** Columnas del tablero. `dropStatus` es el estado que significa soltar aquí. */
const COLUMNS: Array<{ key: string; statuses: FindingStatus[]; dropStatus: FindingStatus }> = [
  { key: 'open', statuses: ['open'], dropStatus: 'open' },
  { key: 'acknowledged', statuses: ['acknowledged'], dropStatus: 'acknowledged' },
  { key: 'in_progress', statuses: ['in_progress'], dropStatus: 'in_progress' },
  {
    key: 'closed',
    statuses: ['resolved', 'false_positive', 'accepted_risk'],
    dropStatus: 'resolved',
  },
];

const SEVERITY_STYLE: Record<FindingSeverity, string> = {
  critical: 'bg-destructive/10 text-destructive border-destructive/30',
  high: 'bg-[oklch(70%_0.19_35)]/10 text-[oklch(70%_0.19_35)] border-[oklch(70%_0.19_35)]/30',
  medium: 'bg-[oklch(75%_0.13_80)]/10 text-[oklch(75%_0.13_80)] border-[oklch(75%_0.13_80)]/30',
  low: 'bg-primary/10 text-primary border-primary/30',
  info: 'bg-muted/20 text-muted-fg border-border/40',
};

export function TriageTab({ initialProjects, selectedProjectId, setSelectedProjectId }: TriageTabProps) {
  const t = useTranslations('triage');

  const [findings, setFindings] = useState<BoardFinding[]>([]);
  const [transitions, setTransitions] = useState<Record<FindingStatus, FindingStatus[]> | null>(null);
  // Proyecto del que ya hay datos: en vez de un booleano de carga se deriva,
  // para no setear estado de forma síncrona dentro del efecto (react-hooks).
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const isLoading = loadedFor !== selectedProjectId;
  // Contador de recargas: al mutar un hallazgo se incrementa y el efecto
  // vuelve a pedir el tablero. Evita un `load` con setState síncrono.
  const [reloadToken, setReloadToken] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [suppressReason, setSuppressReason] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);

  // Carga del tablero dentro del propio efecto: la primera instrucción es un
  // await, así que ningún setState ocurre de forma síncrona en el cuerpo.
  useEffect(() => {
    if (!selectedProjectId) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/intelligence/findings?projectId=${selectedProjectId}`);
        const data = (await res.json()) as TriageResponse & { error?: string };
        if (!active) return;
        if (data.success) {
          setFindings(data.findings ?? []);
          setTransitions(data.transitions ?? null);
          setError(null);
        } else {
          setError(data.error ?? t('error'));
        }
      } catch (err) {
        logger.error('Failed to fetch triage board:', err);
        if (active) setError(t('error'));
      } finally {
        if (active) setLoadedFor(selectedProjectId);
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedProjectId, reloadToken, t]);

  const byColumn = useMemo(() => {
    const map = new Map<string, BoardFinding[]>();
    for (const col of COLUMNS) map.set(col.key, []);
    for (const f of findings) {
      const col = COLUMNS.find((c) => c.statuses.includes(f.status));
      if (col) map.get(col.key)!.push(f);
    }
    return map;
  }, [findings]);

  const selected = findings.find((f) => f.id === selectedId) ?? null;

  const canMove = useCallback(
    (from: FindingStatus, to: FindingStatus): boolean => {
      if (from === to) return false;
      if (!transitions) return false;
      return (transitions[from] ?? []).includes(to);
    },
    [transitions],
  );

  const mutate = useCallback(
    async (finding: BoardFinding, toStatus: FindingStatus) => {
      setBusyId(finding.id);
      setError(null);
      try {
        const res = await fetch(`/api/intelligence/findings/${finding.id}/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: finding.projectId, toStatus }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          setError(data.error ?? t('moveError'));
          return;
        }
        setReloadToken((n) => n + 1);
      } catch (err) {
        logger.error('Failed to transition finding:', err);
        setError(t('moveError'));
      } finally {
        setBusyId(null);
      }
    },
    [t],
  );

  const suppress = useCallback(
    async (finding: BoardFinding) => {
      const reason = suppressReason.trim();
      if (reason.length < 3) return;
      setBusyId(finding.id);
      setError(null);
      try {
        const res = await fetch(`/api/intelligence/findings/${finding.id}/suppress`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: finding.projectId, reason, hours: 24 * 7 }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          setError(data.error ?? t('suppressError'));
          return;
        }
        setSuppressReason('');
        setReloadToken((n) => n + 1);
      } catch (err) {
        logger.error('Failed to suppress finding:', err);
        setError(t('suppressError'));
      } finally {
        setBusyId(null);
      }
    },
    [suppressReason, t],
  );

  const renderActions = (finding: BoardFinding) => {
    const targets = transitions?.[finding.status] ?? [];
    if (targets.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1.5">
        {targets.map((to) => (
          <button
            key={to}
            type="button"
            disabled={busyId === finding.id}
            onClick={() => void mutate(finding, to)}
            className="text-2xs font-bold uppercase tracking-wider px-2 py-1 rounded border border-border/40 text-muted-fg hover:text-foreground hover:border-primary/30 transition-colors disabled:opacity-40 cursor-pointer"
          >
            {t(`actions.${to}`)}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-border/50 pb-6">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <ListChecks aria-hidden="true" className="w-6 h-6 text-[var(--primary)]" />
            {t('pageTitle')}
          </h2>
          <p className="text-xs text-muted-fg mt-1">{t('pageSubtitle')}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <label className="text-2xs font-bold uppercase tracking-widest text-muted-fg">
            {t('projectLabel')}
          </label>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="bg-[#0c0c0e]/80 border border-border text-foreground/80 text-xs rounded-lg px-3 py-2 outline-none focus:border-primary/40 cursor-pointer"
          >
            {initialProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="p-3 text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div className="py-20 flex flex-col items-center gap-3 text-muted-fg">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-xs">{t('loading')}</span>
        </div>
      ) : findings.length === 0 ? (
        <div className="py-20 text-center space-y-3">
          <CheckCircle2 className="w-10 h-10 text-chartreuse mx-auto" />
          <p className="text-sm text-muted-fg">{t('empty')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {COLUMNS.map((col) => (
            <div
              key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = dragId ?? e.dataTransfer.getData('text/plain');
                setDragId(null);
                const finding = findings.find((f) => f.id === id);
                if (!finding) return;
                if (!canMove(finding.status, col.dropStatus)) {
                  setError(t('moveError'));
                  return;
                }
                void mutate(finding, col.dropStatus);
              }}
              className="glass-card rounded-xl border border-border/50 p-4 space-y-3 min-h-[180px]"
            >
              <div className="flex items-center justify-between border-b border-border/40 pb-2">
                <h3 className="text-2xs font-extrabold uppercase tracking-widest text-muted-fg">
                  {t(`columns.${col.key}`)}
                </h3>
                <span className="text-2xs font-bold text-muted-fg bg-muted/20 border border-border/40 px-1.5 py-0.5 rounded">
                  {byColumn.get(col.key)?.length ?? 0}
                </span>
              </div>

              <div className="space-y-2.5">
                {(byColumn.get(col.key) ?? []).map((finding) => {
                  const isSelected = finding.id === selectedId;
                  return (
                    <div
                      key={finding.id}
                      draggable
                      onDragStart={(e) => {
                        setDragId(finding.id);
                        e.dataTransfer.setData('text/plain', finding.id);
                      }}
                      onClick={() => setSelectedId(isSelected ? null : finding.id)}
                      className={`p-3 rounded-lg border bg-muted/5 space-y-2 cursor-pointer transition-colors ${
                        isSelected ? 'border-primary/40 bg-primary/5' : 'border-border/40 hover:border-primary/20'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-bold text-foreground/90 leading-snug">
                          {finding.title}
                        </span>
                        <span
                          className={`text-2xs font-black uppercase border px-1.5 py-0.5 rounded shrink-0 ${SEVERITY_STYLE[finding.severity]}`}
                        >
                          {t(`severity.${finding.severity}`)}
                        </span>
                      </div>

                      {finding.affectedAsset && (
                        <p className="text-2xs text-muted-fg font-mono truncate">
                          {finding.affectedAsset}
                        </p>
                      )}

                      <div className="flex items-center gap-2 flex-wrap">
                        {finding.overdue ? (
                          <span className="text-2xs font-bold text-destructive flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> {t('overdue')}
                          </span>
                        ) : finding.dueAt ? (
                          <span className="text-2xs text-muted-fg flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {formatDateTime(finding.dueAt)}
                          </span>
                        ) : (
                          <span className="text-2xs text-muted-fg">{t('noSla')}</span>
                        )}
                        {finding.suppressedUntil && (
                          <span className="text-2xs text-muted-fg flex items-center gap-1">
                            <Ban className="w-3 h-3" /> {t('suppressed')}
                          </span>
                        )}
                      </div>

                      {isSelected && (
                        <div className="pt-2 border-t border-border/30 space-y-2">
                          <p className="text-2xs text-muted-fg leading-relaxed">
                            {finding.description}
                          </p>
                          {renderActions(finding)}
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={suppressReason}
                              onChange={(e) => setSuppressReason(e.target.value)}
                              placeholder={t('suppressReasonPlaceholder')}
                              className="flex-1 min-w-0 bg-[#0c0c0e]/80 border border-border text-foreground/80 text-2xs rounded px-2 py-1 outline-none focus:border-primary/40"
                            />
                            <button
                              type="button"
                              disabled={busyId === finding.id || suppressReason.trim().length < 3}
                              onClick={() => void suppress(finding)}
                              className="text-2xs font-bold text-muted-fg border border-border/40 rounded px-2 py-1 hover:text-foreground transition-colors disabled:opacity-40 cursor-pointer shrink-0"
                            >
                              {t('actions.suppress')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Panel de detalle del hallazgo seleccionado con su triage IA */}
      {selected?.aiTriage && (
        <div className="glass-card rounded-xl border border-border/50 p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-border/40 pb-3">
            <ShieldAlert className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-white tracking-tight">{t('detail.aiTitle')}</h3>
          </div>
          {typeof selected.aiTriage.businessImpact === 'string' && (
            <div>
              <p className="text-2xs font-bold uppercase tracking-wider text-muted-fg mb-1">
                {t('detail.businessImpact')}
              </p>
              <p className="text-xs text-foreground/80 leading-relaxed">
                {selected.aiTriage.businessImpact}
              </p>
            </div>
          )}
          {Array.isArray(selected.aiTriage.remediation) && (
            <div>
              <p className="text-2xs font-bold uppercase tracking-wider text-muted-fg mb-1">
                {t('detail.remediation')}
              </p>
              <ol className="text-xs text-foreground/80 space-y-1 list-decimal list-inside">
                {(selected.aiTriage.remediation as unknown[]).map((step, i) => (
                  <li key={i}>{String(step)}</li>
                ))}
              </ol>
            </div>
          )}
          {typeof selected.aiTriage.remediation === 'string' && (
            <div>
              <p className="text-2xs font-bold uppercase tracking-wider text-muted-fg mb-1">
                {t('detail.remediation')}
              </p>
              <p className="text-xs text-foreground/80 leading-relaxed">
                {selected.aiTriage.remediation}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
