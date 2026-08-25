'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Crosshair, ShieldOff, ShieldCheck, AlertTriangle, Loader2,
  Terminal, ChevronDown, Clock, Activity, ArrowRight
} from 'lucide-react';

interface ScenarioDef {
  mitreId: string;
  mitreTactic: string;
  mitreTechnique: string;
  name: string;
  description: string;
  detectionAdvice: string;
  severity: string;
  executorType: string;
  prerequisites: string[];
  tags: string[];
  totalRuns: number;
  detectedCount: number;
  detectionRate: number | null;
}

interface AdversaryProject {
  id: string;
  name: string;
  domain?: string;
}

interface AdversaryTabProps {
  projectId: string;
  initialProjects?: AdversaryProject[];
  setSelectedProjectId?: (id: string) => void;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'text-destructive bg-destructive/10 border-destructive/20',
  high: 'text-destructive/80 bg-destructive/10 border-destructive/20',
  medium: 'text-[oklch(75%_0.13_80)] bg-[oklch(75%_0.13_80)]/10 border-[oklch(75%_0.13_80)]/20',
  low: 'text-primary bg-primary/10 border-primary/20',
  info: 'text-muted-fg bg-muted/10 border-border/50',
};

export function AdversaryTab({ projectId, initialProjects = [], setSelectedProjectId }: AdversaryTabProps) {
  const t = useTranslations('adversary');
  const [scenarios, setScenarios] = useState<ScenarioDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningScenario, setRunningScenario] = useState<string | null>(null);
  const [runOutput, setRunOutput] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [reportingResult, setReportingResult] = useState(false);
  const [expandedScenario, setExpandedScenario] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('all');

  const fetchScenarios = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/intelligence/adversary?projectId=${projectId}`);
      const data = await res.json();
      if (data.success) {
        setScenarios(data.catalog);
      } else {
        setError(t('fetchError', { error: data.error || '' }));
      }
    } catch (err: unknown) {
      setError(t('networkError', { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setLoading(false);
    }
  }, [projectId, t]);

  useEffect(() => {
    fetchScenarios();
  }, [fetchScenarios]);

  const handleRunScenario = async (mitreId: string) => {
    setRunningScenario(mitreId);
    setRunOutput(null);
    // Run nuevo → descartar el runId pendiente de reporte anterior
    setActiveRunId(null);
    setError(null);
    try {
      const res = await fetch('/api/intelligence/adversary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioMitreId: mitreId, projectId }),
      });
      const data = await res.json();
      if (data.success) {
        setRunOutput(data.output);
        // Guardar el runId para poder reportar el resultado vía PATCH
        setActiveRunId(data.runId ?? null);
        fetchScenarios();
      } else {
        setError(t('runError', { error: data.error || '' }));
      }
    } catch (err: unknown) {
      setError(t('networkError', { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setRunningScenario(null);
    }
  };

  /**
   * Reporta el resultado real de la simulación al servidor (PATCH),
   * cerrando el loop de detección que antes quedaba solo en el estado local
   * (fix P0: los botones no persistían detectado/missed en la BD).
   */
  const handleReportResult = useCallback(async (result: 'detected' | 'missed') => {
    if (!activeRunId) return;
    setReportingResult(true);
    let reported = false;
    try {
      const res = await fetch('/api/intelligence/adversary', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: activeRunId, result }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success === true) {
        reported = true;
      } else {
        setError(t('runError', { error: data.error || t('patchFailed') }));
      }
    } catch (err: unknown) {
      setError(t('networkError', { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setReportingResult(false);
      // Solo limpiar el panel si el PATCH fue exitoso; si falló, se conserva
      // activeRunId/runOutput para que el usuario pueda reintentar sin
      // volver a ejecutar el escenario (el run quedaría 'missed' si no).
      if (reported) {
        setRunOutput(null);
        setActiveRunId(null);
        fetchScenarios();
      }
    }
  }, [activeRunId, fetchScenarios, t]);

  const filteredScenarios = activeFilter === 'all'
    ? scenarios
    : scenarios.filter((s) => s.mitreTactic === activeFilter);

  const tactics = [...new Set(scenarios.map((s) => s.mitreTactic))].sort();
  const executedCount = scenarios.filter((s) => s.totalRuns > 0).length;
  const totalDetected = scenarios.reduce((sum, s) => sum + s.detectedCount, 0);
  const totalMissed = scenarios.reduce((sum, s) => sum + (s.totalRuns - s.detectedCount), 0);
  const coverageRate = scenarios.length > 0
    ? Math.round((executedCount / scenarios.length) * 100) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
        <span className="ml-3 text-sm text-muted-fg">{t('loading')}</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* Header */}
      <div className="glass-card p-8">
        {/* Project selector — permite cargar un proyecto distinto sin salir del tab */}
        {(initialProjects.length > 0 || setSelectedProjectId) && (
          <div className="mb-6 border-b border-border/50 pb-6">
            <label className="block text-2xs font-bold text-muted-fg uppercase tracking-widest mb-2">
              {t('activeProject')}
            </label>
            <div className="relative max-w-xs">
              <select
                value={projectId}
                onChange={(e) => setSelectedProjectId?.(e.target.value)}
                className="w-full bg-muted border border-border hover:border-primary/20 text-foreground text-xs font-bold rounded-xl py-3 px-4 outline-none transition-[color,background-color,border-color,box-shadow] cursor-pointer appearance-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.8)]"
              >
                {initialProjects.length === 0 && (
                  <option value={projectId} className="bg-muted text-foreground">
                    {projectId}
                  </option>
                )}
                {initialProjects.map((proj) => (
                  <option key={proj.id} value={proj.id} className="bg-muted text-foreground">
                    {proj.name}{proj.domain ? ` (${proj.domain})` : ''}
                  </option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted-fg">▼</div>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-foreground tracking-tight flex items-center gap-3">
              <Crosshair className="w-6 h-6 text-destructive" />
              {t('pageTitle')}
            </h2>
            <p className="text-xs text-muted-fg mt-1 max-w-2xl">
              {t('pageDesc')}
            </p>
          </div>
          <div className="flex items-center gap-2 bg-muted/10 border border-border/50 px-4 py-2 rounded-xl">
            <Activity className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-foreground">{coverageRate}%</span>
            <span className="text-2xs text-muted-fg uppercase tracking-wider">{t('coverage')}</span>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs font-bold flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Run output */}
      {runOutput && (
        <div className="backdrop-blur-xl border border-chartreuse/20 bg-background rounded-2xl overflow-hidden">
          <div className="flex items-center px-6 py-3 border-b border-chartreuse/10 bg-muted/10">
            <Terminal className="w-4 h-4 text-chartreuse mr-2" />
            <span className="text-xs font-bold text-chartreuse uppercase tracking-widest">
              {t('outputTitle')}
            </span>
          </div>
          <pre className="p-6 text-2xs font-mono text-chartreuse/80 leading-relaxed whitespace-pre overflow-x-auto">
            {runOutput}
          </pre>
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-chartreuse/10 bg-muted/10">
            <span className="text-2xs text-muted-fg">{t('reportResult')}</span>
            <button
              onClick={() => handleReportResult('detected')}
              disabled={reportingResult}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-chartreuse/10 border border-chartreuse/20 text-chartreuse text-2xs font-bold hover:bg-chartreuse/20 transition-[color,background-color,border-color,opacity] cursor-pointer disabled:opacity-50"
            >
              <ShieldCheck className="w-3 h-3" /> {t('btnDetected')}
            </button>
            <button
              onClick={() => handleReportResult('missed')}
              disabled={reportingResult}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-2xs font-bold hover:bg-destructive/20 transition-[color,background-color,border-color,opacity] cursor-pointer disabled:opacity-50"
            >
              <ShieldOff className="w-3 h-3" /> {t('btnNotDetected')}
            </button>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setActiveFilter('all')}
          className={`text-2xs font-bold px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${activeFilter === 'all' ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-muted/5 border-border text-muted-fg hover:text-foreground'}`}>
          {t('filterAll', { count: scenarios.length })}
        </button>
        {tactics.map((t) => (
          <button key={t} onClick={() => setActiveFilter(t)}
            className={`text-2xs font-bold px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${activeFilter === t ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-muted/5 border-border text-muted-fg hover:text-foreground'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-muted/5 border border-border/50 p-4 rounded-xl text-center">
          <span className="text-xl font-extrabold text-foreground">{scenarios.length}</span>
          <span className="text-2xs font-bold text-muted-fg uppercase tracking-widest block mt-1">{t('statScenarios')}</span>
        </div>
        <div className="bg-muted/5 border border-border/50 p-4 rounded-xl text-center">
          <span className="text-xl font-extrabold text-chartreuse">{executedCount}</span>
          <span className="text-2xs font-bold text-muted-fg uppercase tracking-widest block mt-1">{t('statExecuted')}</span>
        </div>
        <div className="bg-muted/5 border border-border/50 p-4 rounded-xl text-center">
          <span className="text-xl font-extrabold text-primary">{totalDetected}</span>
          <span className="text-2xs font-bold text-muted-fg uppercase tracking-widest block mt-1">{t('statDetected')}</span>
        </div>
        <div className="bg-muted/5 border border-border/50 p-4 rounded-xl text-center">
          <span className="text-xl font-extrabold text-destructive">{totalMissed}</span>
          <span className="text-2xs font-bold text-muted-fg uppercase tracking-widest block mt-1">{t('statMissed')}</span>
        </div>
      </div>

      {/* Scenario cards */}
      <div className="space-y-4">
        {filteredScenarios.map((scenario) => {
          const sevColor = SEVERITY_COLORS[scenario.severity] || SEVERITY_COLORS.info;
          const isExpanded = expandedScenario === scenario.mitreId;
          const isRunning = runningScenario === scenario.mitreId;
          const detColor = scenario.detectionRate === null ? 'text-muted-fg'
            : scenario.detectionRate >= 80 ? 'text-chartreuse'
            : scenario.detectionRate >= 50 ? 'text-primary' : 'text-destructive';

          return (
            <div key={scenario.mitreId} className="glass-card overflow-hidden transition-colors duration-300 hover:border-primary/15">
              <button onClick={() => setExpandedScenario(isExpanded ? null : scenario.mitreId)}
                className="w-full p-6 flex items-center justify-between text-left cursor-pointer hover:bg-muted/5 transition-colors">
                <div className="flex items-center gap-4 flex-1">
                  <span className={`flex items-center gap-1.5 text-2xs font-bold px-2 py-1 rounded border ${sevColor}`}>
                    {scenario.severity === 'critical' ? '!!!' : scenario.severity === 'high' ? '!!' : scenario.severity === 'medium' ? '!' : '-'}
                    <span>{scenario.severity.charAt(0).toUpperCase() + scenario.severity.slice(1)}</span>
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-2xs font-mono text-muted-fg bg-muted/10 px-1.5 py-0.5 rounded">{scenario.mitreId}</span>
                      <h3 className="text-sm font-bold text-foreground truncate">{scenario.name}</h3>
                    </div>
                    <p className="text-2xs text-muted-fg mt-0.5">{scenario.mitreTechnique}</p>
                  </div>
                  {scenario.detectionRate !== null && (
                    <div className={`text-center px-3 py-1 rounded-lg border ${detColor} bg-muted/5`}>
                      <span className="text-sm font-extrabold">{scenario.detectionRate}%</span>
                      <span className="text-2xs block uppercase tracking-widest">{t('badgeDetected')}</span>
                    </div>
                  )}
                </div>
                <ChevronDown className={`w-4 h-4 text-muted-fg transition-transform duration-300 ml-4 ${isExpanded ? 'rotate-180 text-primary' : ''}`} />
              </button>

              <div className={`transition-[max-height] duration-300 ease-in-out overflow-hidden ${isExpanded ? 'max-h-[600px]' : 'max-h-0'}`}>
                <div className="px-6 pb-6 space-y-4 border-t border-border/50 pt-4">
                  <p className="text-xs text-foreground/80 leading-relaxed">{scenario.description}</p>
                  <div className="bg-primary/5 border border-primary/10 p-4 rounded-xl">
                    <span className="text-2xs font-bold text-primary uppercase tracking-widest flex items-center gap-1.5 mb-2">
                      <ShieldCheck className="w-3 h-3" /> {t('sectionDetection')}
                    </span>
                    <p className="text-2xs text-foreground/70 leading-relaxed">{scenario.detectionAdvice}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {scenario.tags.map((tag, i) => (
                      <span key={i} className="text-2xs font-bold bg-muted/10 border border-border/30 px-1.5 py-0.5 rounded text-muted-fg uppercase tracking-wider">{tag}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 pt-2">
                    <button onClick={(e) => { e.stopPropagation(); handleRunScenario(scenario.mitreId); }}
                      disabled={isRunning}
                      className="flex items-center gap-2 bg-foreground text-background hover:bg-foreground/80 transition-[color,background-color,border-color,opacity,transform] font-bold text-xs uppercase tracking-widest px-5 py-2.5 rounded-xl border border-border cursor-pointer active:scale-95 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed">
                      {isRunning ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('btnRunning')}</>
                        : <><ArrowRight className="w-3.5 h-3.5" /> {t('btnRunSimulation')}</>}
                    </button>
                    {scenario.totalRuns > 0 && (
                      <span className="text-2xs text-muted-fg flex items-center gap-1.5">
                        <Clock className="w-3 h-3" /> {t('runsCount', { total: scenario.totalRuns, detected: scenario.detectedCount })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
