'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { AssessmentProgressBar } from './AssessmentProgressBar';
import {
  Radar, Loader2, AlertTriangle, ChevronDown, ShieldAlert,
  FileDown, CheckCircle2, XCircle, Clock, Zap
} from 'lucide-react';

interface AssessmentRow {
  id: string;
  status: 'pending' | 'running' | 'analyzing' | 'completed' | 'failed';
  target: string;
  riskScore: number | null;
  summary: string | null;
  modelUsed: string | null;
  evidenceCount: number;
  checksTotal: number;
  checksPassed: number;
  checksDone: number;
  currentStep: string | null;
  analysisFailed: boolean;
  error: string | null;
  createdAt: string;
}

interface Vulnerability {
  id: string;
  title: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  cvssScore: string | null;
  cweId: string | null;
  owaspCategory: string | null;
  description: string;
  evidence: { summary?: string } | null;
  remediation: string[];
  references: string[];
  confidence: string;
}

const SEV_COLORS: Record<string, string> = {
  critical: 'text-destructive bg-destructive/10 border-destructive/20',
  high: 'text-destructive/80 bg-destructive/10 border-destructive/20',
  medium: 'text-[oklch(75%_0.13_80)] bg-[oklch(75%_0.13_80)]/10 border-[oklch(75%_0.13_80)]/20',
  low: 'text-primary bg-primary/10 border-primary/20',
  info: 'text-muted-fg bg-muted/10 border-border/50',
};

export function RealAssessmentSection({ projectId }: { projectId: string }) {
  const t = useTranslations('adversaryReal');
  const [authorized, setAuthorized] = useState<boolean>(false);
  const [domain, setDomain] = useState<string>('');
  const [assessments, setAssessments] = useState<AssessmentRow[]>([]);
  const [selected, setSelected] = useState<{ assessment: AssessmentRow; vulnerabilities: Vulnerability[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [savingConsent, setSavingConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedVuln, setExpandedVuln] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchState = useCallback(async (selectLatest = false) => {
    try {
      const res = await fetch(`/api/intelligence/adversary/assessment?projectId=${projectId}`);
      const data = await res.json();
      if (!data.success) {
        setError(data.error ?? t('loadError'));
        return;
      }
      setAuthorized(data.authorized === true);
      setDomain(data.domain ?? '');
      setAssessments(data.assessments ?? []);
      setError(null);

      const active = (data.assessments as AssessmentRow[]).find(
        (a) => a.status === 'pending' || a.status === 'running' || a.status === 'analyzing'
      );
      if (active) {
        if (!pollRef.current) {
          pollRef.current = setInterval(() => void fetchState(true), 5000);
        }
        return;
      }
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (selectLatest && data.assessments?.length > 0) {
        void loadAssessment((data.assessments[0] as AssessmentRow).id);
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadAssessment = useCallback(async (assessmentId: string) => {
    try {
      const res = await fetch(`/api/intelligence/adversary/assessment?projectId=${projectId}&assessmentId=${assessmentId}`);
      const data = await res.json();
      if (data.success) {
        setSelected({ assessment: data.assessment, vulnerabilities: data.vulnerabilities });
      }
    } catch {
      /* noop */
    }
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    setSelected(null);
    void fetchState(false);
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [fetchState]);

  const toggleConsent = async () => {
    setSavingConsent(true);
    try {
      const next = !authorized;
      const res = await fetch('/api/intelligence/adversary/assessment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, activeTestingAuthorized: next }),
      });
      const data = await res.json();
      if (data.success) setAuthorized(next);
      else setError(data.error ?? 'Error');
    } catch {
      setError('Error de conexión');
    } finally {
      setSavingConsent(false);
    }
  };

  const launch = async () => {
    setLaunching(true);
    setError(null);
    try {
      const res = await fetch('/api/intelligence/adversary/assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (data.success) {
        setSelected(null);
        await fetchState(false);
      } else {
        setError(data.error ?? t('networkError'));
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLaunching(false);
    }
  };

  const active = assessments.find(
    (a) => a.status === 'pending' || a.status === 'running' || a.status === 'analyzing'
  );

  if (loading) {
    return (
      <div className="glass-card p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-primary animate-spin" />
        <span className="ml-3 text-xs text-muted-fg">{t('loading')}</span>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 sm:p-8 space-y-6 border-primary/15" id="real-assessment">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-base font-extrabold text-foreground tracking-tight flex items-center gap-2.5">
            <Radar className="w-5 h-5 text-primary" />
            {t('assessmentTitle')}
          </h3>
          <p className="text-2xs text-muted-fg mt-1 max-w-2xl leading-relaxed">
            {t('assessmentDesc', { domain: domain || '—' })}
            {domain && (
              <>
                {' '}· <a href={`/api/intelligence/adversary/report/pdf?projectId=${projectId}`} className="text-primary hover:underline">{t('downloadPdf')}</a>
              </>
            )}
          </p>
        </div>
        {!active && authorized && (
          <button onClick={launch} disabled={launching}
            className="flex items-center gap-2 bg-primary text-primary-foreground font-bold text-2xs uppercase tracking-widest px-5 py-2.5 rounded-xl cursor-pointer active:scale-95 disabled:opacity-50 transition-all shrink-0">
            {launching ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('launching')}</> : <><Zap className="w-3.5 h-3.5" /> {t('launch')}</>}
          </button>
        )}
      </div>

      {/* ── Consentimiento (gate legal) ── */}
      <label className={`block cursor-pointer select-none rounded-xl border p-4 transition-colors ${
        authorized ? 'border-chartreuse/25 bg-chartreuse/5' : 'border-border bg-muted/5'
      }`}>
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={authorized}
            onChange={toggleConsent}
            disabled={savingConsent}
            className="mt-0.5 w-4 h-4 accent-[var(--primary)] cursor-pointer"
          />
          <span className="text-2xs text-foreground/70 leading-relaxed">
            <strong className={authorized ? 'text-chartreuse' : 'text-foreground'}>{t('consentStrong')}</strong>{' '}
            {t('consentRest')}
          </span>
        </div>
      </label>

      {error && (
        <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-2xs font-bold flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Evaluación en curso ── */}
      {active && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
            <span className="text-xs font-bold text-primary uppercase tracking-widest">{t('assessmentActive')}</span>
          </div>
          <AssessmentProgressBar
            status={active.status}
            checksDone={active.checksDone ?? 0}
            checksTotal={active.checksTotal ?? 0}
            currentStep={active.currentStep ?? null}
          />
          <p className="text-2xs text-muted-fg">
            {t('statusLabel')} <span className="font-bold text-foreground">{active.status}</span>
            {" · "}{t('targetLabel')} <span className="font-mono">{active.target}</span>
          </p>
        </div>
      )}

      {/* ── Historial + detalle ── */}
      {!active && assessments.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {assessments.slice(0, 8).map((a) => (
              <button key={a.id} onClick={() => void loadAssessment(a.id)}
                className={`text-2xs font-bold px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                  selected?.assessment.id === a.id
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'bg-muted/5 border-border text-muted-fg hover:text-foreground'
                }`}>
                {new Date(a.createdAt).toLocaleDateString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {a.riskScore !== null ? ` · R${a.riskScore}` : ''}
                {a.status === 'failed' ? ' · ✕' : ''}
              </button>
            ))}
          </div>

          {selected && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatBox label={t("statRisk")} value={selected.assessment.riskScore !== null ? `${selected.assessment.riskScore}/100` : '—'}
                  tone={selected.assessment.riskScore !== null && selected.assessment.riskScore >= 60 ? 'destructive' : selected.assessment.riskScore !== null && selected.assessment.riskScore >= 30 ? 'warning' : 'chartreuse'} />
                <StatBox label={t("statChecks")} value={`${selected.assessment.checksPassed}/${selected.assessment.checksTotal}`} tone="primary" />
                <StatBox label={t("statVulns")} value={String(selected.vulnerabilities.length)} tone="destructive" />
                <StatBox label={t("statModel")} value={selected.assessment.modelUsed ?? (selected.assessment.analysisFailed ? t("modelFailed") : '—')} tone="muted" small />
              </div>

              {selected.assessment.summary && (
                <div className="rounded-xl border border-border/50 bg-muted/5 p-4 text-2xs text-foreground/80 leading-relaxed">
                  {selected.assessment.summary}
                </div>
              )}
              {selected.assessment.error && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-2xs text-destructive">
                  {selected.assessment.error}
                </div>
              )}

              {selected.vulnerabilities.length > 0 && (
                <div className="space-y-2">
                  {[...selected.vulnerabilities]
                    .sort((a, b) => Number(b.cvssScore ?? 0) - Number(a.cvssScore ?? 0))
                    .map((v) => {
                      const open = expandedVuln === v.id;
                      return (
                        <div key={v.id} className="rounded-xl border border-border/50 overflow-hidden bg-background">
                          <button onClick={() => setExpandedVuln(open ? null : v.id)}
                            className="w-full p-4 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-muted/5 transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className={`text-2xs font-bold px-2 py-1 rounded border shrink-0 ${SEV_COLORS[v.severity]}`}>
                                CVSS {v.cvssScore ?? '?'}
                              </span>
                              <span className="text-xs font-bold text-foreground truncate">{v.title}</span>
                            </div>
                            <ChevronDown className={`w-3.5 h-3.5 text-muted-fg shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                          </button>
                          {open && (
                            <div className="px-4 pb-4 space-y-3 border-t border-border/40 pt-3">
                              <div className="flex flex-wrap gap-1.5">
                                {v.cweId && <Tag>{v.cweId}</Tag>}
                                {v.owaspCategory && <Tag>{v.owaspCategory}</Tag>}
                                <Tag>confianza {Math.round(Number(v.confidence) * 100)}%</Tag>
                              </div>
                              <p className="text-2xs text-foreground/75 leading-relaxed">{v.description}</p>
                              {v.evidence?.summary && (
                                <div className="rounded-lg bg-muted/10 border border-border/40 p-3">
                                  <span className="text-2xs font-bold text-primary uppercase tracking-widest block mb-1">Evidencia</span>
                                  <p className="text-2xs text-muted-fg font-mono break-words">{v.evidence.summary}</p>
                                </div>
                              )}
                              <div>
                                <span className="text-2xs font-bold text-chartreuse uppercase tracking-widest block mb-1.5">Remediación</span>
                                <ol className="space-y-1">
                                  {v.remediation.map((step, i) => (
                                    <li key={i} className="text-2xs text-foreground/75 flex gap-2">
                                      <span className="text-chartreuse font-bold">{i + 1}.</span>{step}
                                    </li>
                                  ))}
                                </ol>
                              </div>
                              {v.references.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {v.references.map((ref, i) => (
                                    <a key={i} href={ref} target="_blank" rel="noopener noreferrer"
                                      className="text-2xs text-primary hover:underline break-all">{ref}</a>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}

              {selected.vulnerabilities.length === 0 && !selected.assessment.analysisFailed && selected.assessment.status === 'completed' && (
                <div className="flex items-center gap-2 p-4 rounded-xl border border-chartreuse/20 bg-chartreuse/5 text-2xs text-chartreuse font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  {t('noVulns')}
                </div>
              )}
              {selected.assessment.analysisFailed && (
                <div className="flex items-center gap-2 p-4 rounded-xl border border-border/50 bg-muted/5 text-2xs text-muted-fg">
                  <XCircle className="w-4 h-4" />
                  {t('analysisFailed')}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!active && assessments.length === 0 && (
        <div className="flex items-center gap-2 p-4 rounded-xl border border-border/50 bg-muted/5 text-2xs text-muted-fg">
          <Clock className="w-4 h-4" />
          {t('noAssessments')}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, tone, small }: { label: string; value: string; tone: string; small?: boolean }) {
  const color = tone === 'destructive' ? 'text-destructive' : tone === 'warning' ? 'text-[oklch(75%_0.13_80)]' : tone === 'chartreuse' ? 'text-chartreuse' : tone === 'primary' ? 'text-primary' : 'text-muted-fg';
  return (
    <div className="bg-muted/5 border border-border/50 p-3 rounded-xl text-center">
      <span className={`${small ? 'text-2xs' : 'text-lg'} font-extrabold ${color} block ${small ? '' : 'mb-0.5'} truncate`} title={value}>{value}</span>
      <span className="text-2xs font-bold text-muted-fg uppercase tracking-widest">{label}</span>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="text-2xs font-bold bg-muted/10 border border-border/30 px-1.5 py-0.5 rounded text-muted-fg">{children}</span>;
}
