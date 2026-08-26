'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Target, Loader2, ChevronDown, ShieldAlert, ShieldCheck, BookOpen, Zap } from 'lucide-react';

export type MitreVerdict = 'exposed' | 'not_exposed' | 'not_externally_testable' | 'error';

export interface MitreEvaluationRow {
  id: string;
  status: 'pending' | 'running' | 'analyzing' | 'completed' | 'failed';
  target: string;
  riskScore: number | null;
  summary: string | null;
  modelUsed: string | null;
  exposedCount: number;
  protectedCount: number;
  manualOnlyCount: number;
  error: string | null;
  createdAt: string;
}

export interface MitreResultRow {
  id: string;
  mitreId: string;
  tactic: string;
  techniqueName: string;
  verdict: MitreVerdict;
  confidence: string;
  summary: string | null;
  remediation: string[];
  playbook: string[];
}

// Labels i18n resueltos en render (t) — solo clases aquí
const VERDICT_CLS: Record<MitreVerdict, string> = {
  exposed: 'text-destructive bg-destructive/10 border-destructive/20',
  not_exposed: 'text-chartreuse bg-chartreuse/10 border-chartreuse/20',
  not_externally_testable: 'text-primary bg-primary/10 border-primary/20',
  error: 'text-muted-fg bg-muted/10 border-border/50',
};

function verdictLabel(verdict: MitreVerdict, t: ReturnType<typeof useTranslations>): string {
  switch (verdict) {
    case 'exposed': return t('verdictExposed');
    case 'not_exposed': return t('verdictProtected');
    case 'not_externally_testable': return t('verdictManual');
    default: return t('verdictNoData');
  }
}

interface Props {
  projectId: string;
  /** Notifica veredictos reales al padre (para badges en tarjetas de escenario). */
  onVerdicts?: (map: Record<string, MitreVerdict>) => void;
}

export function MitreRealCoverage({ projectId, onVerdicts }: Props) {
  const t = useTranslations('adversaryReal');
  const [authorized, setAuthorized] = useState(false);
  const [evaluations, setEvaluations] = useState<MitreEvaluationRow[]>([]);
  const [selected, setSelected] = useState<{ evaluation: MitreEvaluationRow; results: MitreResultRow[] } | null>(null);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchState = useCallback(async () => {
    try {
      // Autorización (compartida con la evaluación real general)
      const authRes = await fetch(`/api/intelligence/adversary/assessment?projectId=${projectId}`);
      const authData = await authRes.json();
      if (authData.success) setAuthorized(authData.authorized === true);

      const res = await fetch(`/api/intelligence/adversary/mitre?projectId=${projectId}`);
      const data = await res.json();
      if (!data.success) return;
      setEvaluations(data.evaluations ?? []);

      const active = (data.evaluations as MitreEvaluationRow[]).find(
        (e) => e.status === 'pending' || e.status === 'running' || e.status === 'analyzing'
      );
      if (active) {
        if (!pollRef.current) pollRef.current = setInterval(() => void fetchState(), 5000);
        return;
      }
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }

      // Cargar automáticamente la última completada y notificar veredictos
      const latestCompleted = (data.evaluations as MitreEvaluationRow[]).find((e) => e.status === 'completed');
      if (latestCompleted) await loadEvaluation(latestCompleted.id);
    } catch {
      /* silencioso */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const loadEvaluation = useCallback(async (evaluationId: string) => {
    try {
      const res = await fetch(`/api/intelligence/adversary/mitre?projectId=${projectId}&evaluationId=${evaluationId}`);
      const data = await res.json();
      if (!data.success) return;
      setSelected({ evaluation: data.evaluation, results: data.results });
      const map: Record<string, MitreVerdict> = {};
      for (const r of data.results as MitreResultRow[]) map[r.mitreId] = r.verdict;
      onVerdicts?.(map);
    } catch {
      /* silencioso */
    }
  }, [projectId, onVerdicts]);

  useEffect(() => {
    void fetchState();
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [fetchState]);

  const launch = async () => {
    setLaunching(true);
    setError(null);
    try {
      const res = await fetch('/api/intelligence/adversary/mitre', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (data.success) {
        setSelected(null);
        await fetchState();
      } else {
        setError(data.error ?? t('networkError'));
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLaunching(false);
    }
  };

  const active = evaluations.find((e) => e.status === 'pending' || e.status === 'running' || e.status === 'analyzing');

  return (
    <div className="rounded-2xl border border-primary/15 bg-background p-5 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h4 className="text-sm font-extrabold text-foreground flex items-center gap-2">
            <Target className="w-4 h-4 text-destructive" />
            {t('mitreTitle')}
          </h4>
          <p className="text-2xs text-muted-fg mt-1 max-w-xl leading-relaxed">
            {t('mitreDesc')}
          </p>
        </div>
        {!active && (
          <button onClick={launch} disabled={launching || !authorized}
            title={authorized ? undefined : t('needConsentTitle')}
            className="flex items-center gap-2 bg-foreground text-background font-bold text-2xs uppercase tracking-widest px-4 py-2 rounded-xl cursor-pointer active:scale-95 disabled:opacity-40 transition-all shrink-0">
            {launching ? <><Loader2 className="w-3 h-3 animate-spin" /> {t('launching')}</> : <><Zap className="w-3 h-3" /> {t('mitreLaunch')}</>}
          </button>
        )}
      </div>

      {error && (
        <p className="text-2xs text-destructive font-bold p-3 rounded-lg border border-destructive/20 bg-destructive/5">{error}</p>
      )}

      {!authorized && !active && evaluations.length === 0 && (
        <p className="text-2xs text-muted-fg p-3 rounded-lg border border-border/50 bg-muted/5">
          {t('needConsent')}
        </p>
      )}

      {active && (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-primary/20 bg-primary/5">
          <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
          <span className="text-2xs font-bold text-primary uppercase tracking-widest">{t('mitreRunning', { status: active.status })}</span>
        </div>
      )}

      {/* Historial */}
      {!active && evaluations.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {evaluations.slice(0, 8).map((e) => (
            <button key={e.id} onClick={() => void loadEvaluation(e.id)}
              className={`text-2xs font-bold px-2.5 py-1 rounded-lg border cursor-pointer transition-colors ${
                selected?.evaluation.id === e.id ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-muted/5 border-border text-muted-fg hover:text-foreground'
              }`}>
              {new Date(e.createdAt).toLocaleDateString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              {e.riskScore !== null ? ` · R${e.riskScore}` : ''}
            </button>
          ))}
        </div>
      )}

      {/* Resumen + matriz */}
      {selected && (
        <div className="space-y-3">
          {selected.evaluation.summary && (
            <div className="grid grid-cols-3 gap-2 mb-2">
              <Stat n={selected.evaluation.exposedCount} label={t("statExposed")} tone="destructive" />
              <Stat n={selected.evaluation.protectedCount} label={t("statProtected")} tone="chartreuse" />
              <Stat n={selected.evaluation.manualOnlyCount} label={t("statManual")} tone="primary" />
            </div>
          )}
          {selected.evaluation.summary && (
            <p className="text-2xs text-foreground/80 leading-relaxed p-3 rounded-xl border border-border/50 bg-muted/5">
              {selected.evaluation.summary}
            </p>
          )}
          {selected.evaluation.error && (
            <p className="text-2xs text-destructive p-3 rounded-xl border border-destructive/20 bg-destructive/5">{selected.evaluation.error}</p>
          )}

          <div className="space-y-1.5">
            {selected.results.map((r) => {
              const style = { label: verdictLabel(r.verdict, t), cls: VERDICT_CLS[r.verdict] };
              const open = expandedResult === r.id;
              const hasDetail = r.remediation.length > 0 || r.playbook.length > 0 || r.summary;
              return (
                <div key={r.id} className="rounded-xl border border-border/50 overflow-hidden">
                  <button onClick={() => hasDetail && setExpandedResult(open ? null : r.id)}
                    className={`w-full px-3 py-2 flex items-center justify-between gap-2 text-left ${hasDetail ? 'cursor-pointer hover:bg-muted/5' : 'cursor-default'} transition-colors`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-2xs font-bold px-1.5 py-0.5 rounded border shrink-0 ${style.cls}`}>{style.label}</span>
                      <span className="text-2xs font-mono text-muted-fg">{r.mitreId}</span>
                      <span className="text-2xs font-bold text-foreground truncate">{r.techniqueName}</span>
                    </div>
                    {hasDetail && <ChevronDown className={`w-3 h-3 text-muted-fg shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />}
                  </button>
                  {open && (
                    <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border/40">
                      {r.summary && <p className="text-2xs text-foreground/75 leading-relaxed">{r.summary}</p>}
                      {r.remediation.length > 0 && (
                        <div>
                          <span className="text-2xs font-bold text-chartreuse uppercase tracking-widest block mb-1">{t('solutions')}</span>
                          <ol className="space-y-0.5">
                            {r.remediation.map((s, i) => (
                              <li key={i} className="text-2xs text-foreground/70 flex gap-1.5"><span className="text-chartreuse font-bold">{i + 1}.</span>{s}</li>
                            ))}
                          </ol>
                        </div>
                      )}
                      {r.playbook.length > 0 && (
                        <div className="rounded-lg bg-primary/5 border border-primary/10 p-2.5">
                          <span className="text-2xs font-bold text-primary uppercase tracking-widest flex items-center gap-1 mb-1">
                            <BookOpen className="w-3 h-3" /> {t('playbookTitle')}
                          </span>
                          <ol className="space-y-1">
                            {r.playbook.map((s, i) => (
                              <li key={i} className="text-2xs text-foreground/75 leading-relaxed"><span className="font-bold">{i + 1}.</span> {s}</li>
                            ))}
                          </ol>
                        </div>
                      )}
                      <a href={`/api/intelligence/adversary/mitre/report/pdf?projectId=${projectId}&evaluationId=${selected.evaluation.id}`}
                        target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-2xs text-primary hover:underline">
                        {t('pdfFullReport')}
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone: string }) {
  const color = tone === 'destructive' ? 'text-destructive' : tone === 'chartreuse' ? 'text-chartreuse' : 'text-primary';
  return (
    <div className="bg-muted/5 border border-border/50 p-2 rounded-lg text-center">
      <span className={`text-base font-extrabold ${color}`}>{n}</span>
      <span className="text-2xs font-bold text-muted-fg uppercase tracking-widest block">{label}</span>
    </div>
  );
}
