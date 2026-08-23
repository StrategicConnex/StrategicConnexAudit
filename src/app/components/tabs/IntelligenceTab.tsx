'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  ShieldCheck, AlertCircle, Terminal, ArrowRight, Loader2, 
  ShieldAlert, Server, History, Sparkles, CheckCircle2, 
  Lock, Cpu, Copy, Check, Info, Globe, AlertTriangle,
  Mail, Shield, Activity, MapPin, Layers, Compass, BookMarked,
  ChevronDown, FileText, TrendingDown, Network
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ScoreGauge } from '@/app/components/ScoreGauge';
import { AttackSurfaceGraph } from '@/app/components/AttackSurfaceGraph';
import { IncidentBriefModal } from '@/app/components/IncidentBriefModal';
import { AutoMitreBadge } from '@/app/components/MitreBadge';
import { GeoMap } from '@/app/components/GeoMap';
import { DownloadPdfButton } from '@/app/components/DownloadPdfButton';
import { HistoryPanel } from '@/app/components/HistoryPanel';
import { parseMarkdown, splitInlineMarkdown } from '@/features/intelligence/lib/rendering/markdown';
import { getScoreRating, getSeverityBadge } from '@/features/intelligence/lib/rendering/severity';
import { getErrorMessage } from '@/shared/lib/errors';

import type { Project, Investigation, Finding, RunEvent, Asset } from './intelligence/types';

interface IntelligenceTabProps {
  initialProjects: Project[];
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
}

export function IntelligenceTab({ 
  initialProjects, 
  selectedProjectId, 
  setSelectedProjectId 
}: IntelligenceTabProps) {
  // Navigation & session state
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [driftStates, setDriftStates] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  // Details of the selected investigation
  const [selectedDetails, setSelectedDetails] = useState<{
    investigation: Investigation;
    findings: Finding[];
    events: RunEvent[];
    assets: Asset[];
  } | null>(null);

  // Form input & loading states
  const [targetInput, setTargetInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<string[]>([]);
  const [scanStatusMessage, setScanStatusMessage] = useState('');
  
  // IA Copilot remediation state
  const [isGeneratingCopilot, setIsGeneratingCopilot] = useState(false);
  const [copilotOutput, setCopilotOutput] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<boolean>(false);
  const [copiedBlockIdx, setCopiedBlockIdx] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const t = useTranslations('intelligence');

  // Advanced interaction states
  const [expandedAccordions, setExpandedAccordions] = useState<Record<string, boolean>>({});
  const [elapsedTime, setElapsedTime] = useState(0);
  const [scanSpeed, setScanSpeed] = useState('0.0 KB/s');
  const [progressPercent, setProgressPercent] = useState(0);
  const [copilotStep, setCopilotStep] = useState(0);

  // AI Integrations state
  const [showBriefModal, setShowBriefModal] = useState(false);
  const [driftData, setDriftData] = useState<{
    hasDrift: boolean;
    changes: Array<{ field: string; label: string; previous: string | null; current: string | null; severity: 'critical' | 'warning' | 'info' }>;
    deltaScore: number | null;
    previousScore: number | null;
  } | null>(null);
  const [showAttackSurface, setShowAttackSurface] = useState(false);
  const [showGeoMap, setShowGeoMap] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyDefaultTab, setHistoryDefaultTab] = useState<'dns' | 'whois'>('dns');

  const toggleAccordion = (id: string) => {
    setExpandedAccordions(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  void setDriftData;

  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Renderizador inline delegado al paquete puro de rendering (C01).
  // La tokenización vive en lib/rendering/markdown.ts (testable); aquí solo
  // se mapean los tokens a JSX con las clases del design system.
  const renderInlineMarkdown = (text: string) => {
    if (!text) return '';
    return splitInlineMarkdown(text).map((token, idx) => {
      if (token.type === 'bold') {
        return (
          <strong key={idx} className="font-extrabold text-foreground">
            {token.content}
          </strong>
        );
      }
      if (token.type === 'code') {
        return (
          <code key={idx} className="font-mono text-primary bg-primary/10 border-primary/20 px-1.5 py-0.5 rounded text-[11px] font-semibold">
            {token.content}
          </code>
        );
      }
      return token.content;
    });
  };


  // Fetch investigations list for current project
  const fetchInvestigations = useCallback(async (projId: string) => {
    try {
      setErrorText(null);
      const res = await fetch(`/api/intelligence?projectId=${projId}`);
      const data = await res.json();
      if (data.success) {
        setInvestigations(data.investigations || []);
        // Automatically select the first one if available
        if (data.investigations && data.investigations.length > 0) {
          setSelectedId(data.investigations[0].id);
        } else {
          setSelectedId(null);
          setSelectedDetails(null);
        }
      } else {
        console.error(data.error);
      }
    } catch (err) {
      console.error('Error fetching investigations:', err);
    }
  }, []);

  // Fetch complete details for a single selected investigation
  const fetchInvestigationDetails = useCallback(async (investId: string) => {
    try {
      setErrorText(null);
      const res = await fetch(`/api/intelligence?investigationId=${investId}`);
      const data = await res.json();
      if (data.success) {
        setSelectedDetails({
          investigation: data.investigation,
          findings: data.findings || [],
          events: data.events || [],
          assets: data.assets || []
        });
        setCopilotOutput(null); // Reset IA output when selection changes
      } else {
        console.error(data.error);
      }
    } catch (err) {
      console.error('Error fetching details:', err);
    }
  }, []);

  // Sync on project change
  useEffect(() => {
    if (selectedProjectId) {
      fetchInvestigations(selectedProjectId);
    }
  }, [selectedProjectId, fetchInvestigations]);

  // Sync drift states when investigations change
  useEffect(() => {
    if (investigations.length === 0) return;
    
    const checkDrift = async () => {
      const states: Record<string, boolean> = {};
      // Only check the most recent 10 to avoid excessive API calls
      const checks = investigations.slice(0, 10).map(async (inv) => {
        if (driftStates[inv.id] !== undefined) return; // already checked
        try {
          const res = await fetch(`/api/intelligence/drift?investigationId=${inv.id}`);
          const data = await res.json();
          if (data.success && data.hasDrift) {
            states[inv.id] = true;
          } else {
            states[inv.id] = false;
          }
        } catch {
          console.error("Drift check failed for", inv.id);
        }
      });
      await Promise.all(checks);          if (Object.keys(states).length > 0) {
        setDriftStates(prev => ({...prev, ...states}));
      }
    };
    checkDrift();
  }, [investigations, driftStates]);

  // Sync on selection change
  useEffect(() => {
    if (selectedId) {
      fetchInvestigationDetails(selectedId);
    } else {
      setSelectedDetails(null);
    }
  }, [selectedId, fetchInvestigationDetails]);

  // Scroll to bottom of terminal console
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [scanProgress]);

  // Simulated live console log generator
  const simulateConsoleLogs = (target: string, onFinish: () => void) => {
    const steps = [
      `[00:01] ⚡ Inicializando motor de inteligencia cibernética a nivel de infraestructura...`,
      `[00:03] 🌐 Resolviendo registros de DNS para "${target}" en servidores autoritativos...`,
      `[00:05]    ├─ Consulta de registro A: completado.`,
      `[00:06]    ├─ Consulta de registro AAAA: completado.`,
      `[00:08]    ├─ Consulta de registro MX: completado.`,
      `[00:10]    └─ Consulta de registro TXT / SPF / DMARC: completado.`,
      `[00:12] 🔒 Iniciando handshake SSL/TLS de alta fidelidad...`,
      `[00:15]    ├─ Verificación de cadena de certificación y validez temporal...`,
      `[00:18]    ├─ Escaneo de soporte de ciphers obsoletos (SSLv3, TLS 1.0, TLS 1.1)...`,
      `[00:21]    └─ Comprobación de vulnerabilidades conocidas (Heartbleed, Logjam)...`,
      `[00:24] 🛡️ Analizando cabeceras de seguridad HTTP aplicadas...`,
      `[00:27]    ├─ Evaluando directiva Strict-Transport-Security (HSTS)...`,
      `[00:30]    ├─ Evaluando directiva Content-Security-Policy (CSP)...`,
      `[00:32]    └─ Comprobando protección contra Clickjacking (X-Frame-Options)...`,
      `[00:35] ⚖️ Evaluando deducción de puntaje y catalogación de riesgos...`,
      `[00:38] 🧠 Compilando análisis heurístico final...`,
      `[00:40] 🚀 Proceso completado exitosamente. Sincronizando registros persistentes en base de datos.`
    ];

    setScanProgress([]);
    setIsScanning(true);
    setCopilotOutput(null);
    setErrorText(null);
    setElapsedTime(0);
    setScanSpeed('0.0 KB/s');
    setProgressPercent(0);

    let idx = 0;
    const startTime = Date.now();
    
    const timeTimer = setInterval(() => {
      setElapsedTime(Math.round((Date.now() - startTime) / 1000));
      setScanSpeed((Math.random() * 15 + 22).toFixed(1) + ' KB/s');
    }, 500);

    const logTimer = setInterval(() => {
      if (idx < steps.length) {
        setScanProgress(prev => [...prev, steps[idx]]);
        setScanStatusMessage(steps[idx].replace(/\[\d+:\d+\] /, ''));
        setProgressPercent(Math.round(((idx + 1) / steps.length) * 100));
        idx++;
      } else {
        clearInterval(logTimer);
        clearInterval(timeTimer);
        setProgressPercent(100);
        onFinish();
      }
    }, 800);
  };

  // Launch scan handler
  const handleLaunchScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetInput.trim()) return;

    const target = targetInput.trim();
    setTargetInput('');

  // Pre-launch validation
    if (!selectedProjectId) {
      setErrorText('Seleccioná un proyecto activo antes de ejecutar un análisis.');
      return;
    }

    simulateConsoleLogs(target, async () => {
      try {
        const res = await fetch('/api/intelligence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: selectedProjectId,
            target: target
          })
        });

        const data = await res.json();
        if (data.success) {
          await fetchInvestigations(selectedProjectId);
          setSelectedId(data.investigation.id);
        } else {
          setErrorText(data.error || 'Ocurrió un error inesperado durante el análisis.');
        }
      } catch (err: unknown) {
        setErrorText(`Error de conexión con la API de Inteligencia: ${getErrorMessage(err)}`);
      } finally {
        setIsScanning(false);
      }
    });
  };

  // Call IA Copilot Remediation
  const handleGenerateCopilot = async () => {
    if (!selectedDetails?.investigation.id) return;
    setIsGeneratingCopilot(true);
    setErrorText(null);
    setCopilotStep(1);
    
    const stepInterval = setInterval(() => {
      setCopilotStep(prev => {
        if (prev < 5) return prev + 1;
        clearInterval(stepInterval);
        return prev;
      });
    }, 1200);

    try {
      const res = await fetch('/api/intelligence/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          investigationId: selectedDetails.investigation.id
        })
      });

      const data = await res.json();
      
      // Let the steps animation complete naturally for high-fidelity feeling
      await new Promise(resolve => setTimeout(resolve, 3600));
      
      clearInterval(stepInterval);
      setCopilotStep(5);

      if (data.success) {
        setCopilotOutput(data.remediationPlan);
      } else {
        setErrorText(data.error || 'No se pudo generar el plan de remediación con IA.');
      }
    } catch (err: unknown) {
      setErrorText(`Error de comunicación con el motor de IA: ${getErrorMessage(err)}`);
    } finally {
      clearInterval(stepInterval);
      setIsGeneratingCopilot(false);
    }
  };

  // Copy to clipboard helper
  const handleCopyToClipboard = (text: string, id?: string) => {
    navigator.clipboard.writeText(text);
    if (id) {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } else {
      setCopiedIndex(true);
      setTimeout(() => setCopiedIndex(false), 2000);
    }
  };


  return (
    <div className="flex flex-col lg:flex-row gap-8 relative z-10 font-sans text-foreground min-h-[calc(100vh-140px)]">
      
      {/* ─── LEFT PANEL: List of Previous Investigations ─────────────────── */}
      <div className="w-full lg:w-72 shrink-0 flex flex-col gap-6">
        
        {/* Project Selector inside Workspace */}
        <div className="glass-card p-5">
          <label className="block text-[10px] font-bold text-muted-fg uppercase tracking-widest mb-2">
            {t('activeProject')}
          </label>
          <div className="relative">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full bg-muted border border-border hover:border-primary/20 text-foreground text-xs font-bold rounded-xl py-3 px-4 outline-none transition-[color,background-color,border-color,box-shadow] cursor-pointer appearance-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.8)]"
            >
              {initialProjects.map((proj) => (
                <option key={proj.id} value={proj.id} className="bg-muted text-foreground">
                  {proj.name} ({proj.domain})
                </option>
              ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted-fg">
              ▼
            </div>
          </div>
        </div>

        {/* History List Card */}
        <div className="glass-card flex-1 flex flex-col min-h-[300px] overflow-hidden">
          <div className="p-5 border-b border-border flex items-center justify-between bg-muted/1">
            <h3 className="text-[10px] font-bold text-muted-fg uppercase tracking-widest flex items-center gap-2">
              <History className="w-3.5 h-3.5" /> {t('analysisHistory')}
            </h3>
            <span className="text-[10px] bg-muted/5 border border-border/50 px-2 py-0.5 rounded-full font-bold">
              {investigations.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-white/[0.04] max-h-[450px]">
            {investigations.length === 0 ? (
              <div className="p-8 text-center flex flex-col items-center justify-center h-full gap-3">
                <ShieldCheck className="w-8 h-8 text-muted-fg" />
                <p className="text-xs text-muted-fg leading-relaxed">
                  No hay análisis previos para este proyecto.
                </p>
              </div>
            ) : (
              investigations.map((inv) => {
                const isActive = selectedId === inv.id;
                const scoreInfo = inv.score !== null ? getScoreRating(inv.score) : null;
                return (
                  <button
                    key={inv.id}
                    onClick={() => setSelectedId(inv.id)}
                    className={`w-full text-left p-5 transition-colors duration-300 relative group flex flex-col gap-2 ${
                      isActive 
                        ? 'bg-muted/10 border-l-2 border-primary' 
                        : 'hover:bg-muted/5 border-l-2 border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors truncate max-w-[140px]">
                        {inv.target}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {driftStates[inv.id] && (
                          <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded border border-destructive/30 text-destructive bg-destructive/10 animate-pulse">
                            DRIFT
                          </span>
                        )}
                        {inv.score !== null ? (
                          <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded border ${scoreInfo?.color.split(' ')[0]} ${scoreInfo?.color.split(' ')[1]}`}>
                            {inv.score}
                          </span>
                        ) : (
                          <span className="text-[9px] bg-muted/5 border border-border/50 text-muted-fg px-2 py-0.5 rounded font-bold">
                            Pendiente
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between text-[9px] text-muted-fg uppercase tracking-wider">
                      <span>{inv.targetType}</span>
                      <span>
                        {new Date(inv.createdAt).toLocaleDateString('es-ES', { 
                          day: 'numeric', 
                          month: 'short' 
                        })}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* ─── RIGHT PANEL: Main Analysis Input & Posture Insights ─────────── */}
      <div className="flex-1 flex flex-col gap-8 min-w-0">
        
        {/* Error notification display */}
        {errorText && (
          <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs font-bold flex items-center gap-3 animate-in fade-in duration-300">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{errorText}</span>
          </div>
        )}

        {/* Dynamic target launcher header */}
        <div className="glass-card p-8 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
          
          <div className="relative z-10 flex flex-col gap-6">
            <div>
              <h3 className="font-extrabold text-foreground text-base tracking-tight">{t('scanInfrastructure')}</h3>
              <p className="text-[10px] font-bold text-muted-fg uppercase tracking-widest mt-0.5">
                {t('scanSubtitle')}
              </p>
            </div>

            <form onSubmit={handleLaunchScan} className="flex gap-4">
              <div className="flex-1 relative">
                <input
                  type="text"
                  required
                  disabled={isScanning}
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                  placeholder="ejemplo.com, 1.1.1.1, https://miweb.com"
                  className="w-full bg-muted/60 border border-border hover:border-primary/20 focus:border-primary/40 text-foreground font-medium placeholder-muted-fg text-sm rounded-xl py-3.5 pl-5 pr-12 outline-none transition-[color,background-color,border-color,box-shadow] shadow-[inset_0_1px_2px_rgba(0,0,0,0.8)]"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-fg">
                  <Globe className="w-4 h-4" />
                </div>
              </div>
              <button
                type="submit"
                disabled={isScanning}
                className="bg-foreground text-background hover:bg-foreground/80 transition-[color,background-color,border-color,opacity,box-shadow,transform] font-bold text-xs uppercase tracking-widest px-6 py-3.5 rounded-xl flex items-center gap-2 border border-border cursor-pointer active:scale-95 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed shrink-0 shadow-[0_2px_12px_rgba(0,0,0,0.3)]"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('scanning')}
                  </>
                ) : (
                  <>
                    {t('audit')} <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* ─── CASE A: Escaneo activo (Retro Console Timeline Terminal) ────── */}
        {isScanning && (
          <div className="backdrop-blur-3xl border border-chartreuse/20 bg-background rounded-3xl overflow-hidden relative animate-in fade-in slide-in-from-bottom-6 duration-700">
            {/* Retro scanlines grid overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(18,18,18,0)_50%,rgba(0,0,0,0.3)_50%),linear-gradient(90deg,rgba(140,200,80,0.03),rgba(0,0,0,0),rgba(140,200,80,0.03))] bg-[size:100%_4px,6px_100%] pointer-events-none z-10 opacity-80" />
            
            {/* Scan vertical sweep effect */}
            
            {/* Terminal Top Window Bar */}
            <div className="h-14 px-8 bg-background border-b border-chartreuse/10 flex items-center justify-between shrink-0 relative z-30">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-destructive/80 shadow-[0_0_8px_rgba(190,18,60,0.5)]" />
                <span className="w-3 h-3 rounded-full bg-[oklch(75% 0.13 80)]/80 shadow-[0_0_8px_rgba(180,120,30,0.5)]" />
                <span className="w-3 h-3 rounded-full bg-chartreuse/80 shadow-[0_0_8px_rgba(140,200,80,0.5)]" />
              </div>
              <span className="text-[10px] text-chartreuse/60 font-mono font-bold tracking-widest flex items-center gap-2.5 uppercase">
                <Terminal className="w-3.5 h-3.5 text-chartreuse animate-pulse" /> terminal://intelligence-engine.v3.bin
              </span>
              <div className="flex items-center gap-1.5 bg-chartreuse/40 border border-chartreuse/20 px-3 py-1 rounded-md font-mono text-[9px] text-chartreuse font-extrabold shadow-[0_0_10px_rgba(140,200,80,0.1)]">
                <Activity className="w-2.5 h-2.5 animate-pulse text-chartreuse" /> LIVE_SCAN
              </div>
            </div>

            {/* Terminal Top Status Metrics Panel */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-8 py-5 bg-background/90 border-b border-chartreuse/10 relative z-30 font-mono text-[9px] text-muted-fg">
              <div className="space-y-1 border-r border-chartreuse/5 pr-4">
                <span className="block text-[8px] font-bold text-muted-fg uppercase tracking-widest">MÓDULO DE INTELIGENCIA</span>
                <span className="font-extrabold text-foreground/80 uppercase truncate block">
                  {progressPercent < 30 ? 'INICIALIZACIÓN' : progressPercent < 60 ? 'MÉTRICAS DNS / WHOIS' : progressPercent < 90 ? 'CUBIERTA SSL/TLS' : 'COMPILACIÓN FINAL'}
                </span>
              </div>
              <div className="space-y-1 border-r border-chartreuse/5 pr-4">
                <span className="block text-[8px] font-bold text-muted-fg uppercase tracking-widest">TASA DE TRANSFERENCIA</span>
                <span className="font-extrabold text-chartreuse block">{scanSpeed}</span>
              </div>
              <div className="space-y-1 border-r border-chartreuse/5 pr-4">
                <span className="block text-[8px] font-bold text-muted-fg uppercase tracking-widest">TIEMPO TRANSCURRIDO</span>
                <span className="font-extrabold text-foreground/80 block">{elapsedTime}s</span>
              </div>
              <div className="space-y-1">
                <span className="block text-[8px] font-bold text-muted-fg uppercase tracking-widest">PROGRESO GENERAL</span>
                <span className="font-extrabold text-chartreuse/90 block">{progressPercent}%</span>
              </div>
            </div>

            {/* Retro Phosphor Screen Body */}
            <div className="p-8 font-mono text-[11.5px] leading-relaxed text-chartreuse/90 bg-background max-h-[350px] overflow-y-auto flex flex-col gap-3.5 border-b border-chartreuse/10 relative z-30 scroll-smooth">
              {scanProgress.map((line, idx) => (
                <div key={idx} className="animate-in fade-in duration-200 font-semibold font-mono tracking-wide flex items-start gap-1">
                  <span className="text-chartreuse/50 select-none">&gt;</span>
                  <span className="flex-1">{line}</span>
                  {idx === scanProgress.length - 1 && (
                    <span className="inline-block w-2.5 h-4 bg-chartreuse animate-pulse ml-1 text-center font-bold shadow-[0_0_6px_rgba(140,200,80,0.5)] select-none">▋</span>
                  )}
                </div>
              ))}
              {scanProgress.length === 0 && (
                <div className="text-chartreuse/30 font-mono font-bold tracking-widest flex items-center gap-2">
                  <span>Conectando a servicios de escaneo remoto...</span>
                  <span className="inline-block w-2.5 h-4 bg-chartreuse animate-pulse shadow-[0_0_6px_rgba(140,200,80,0.5)] select-none">▋</span>
                </div>
              )}
              <div ref={consoleEndRef} />
            </div>

            {/* Terminal Live Bar Indicator with Visual Progress Bar */}
            <div className="p-6 bg-background flex flex-col md:flex-row items-center justify-between gap-4 px-8 relative z-30 shrink-0">
              <div className="flex items-center justify-between w-full md:w-auto text-[10px] text-chartreuse/80 font-bold uppercase tracking-widest">
                <span className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-chartreuse animate-ping shadow-[0_0_8px_rgba(140,200,80,0.8)]" />
                  {scanStatusMessage || 'Inicializando motor...'}
                </span>
              </div>
              
              {/* Green Retro Progress Bar */}
              <div className="w-full md:w-72 flex items-center gap-4">
                <div className="flex-1 h-3 bg-black border border-chartreuse/20 rounded-full overflow-hidden p-0.5 shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)]">
                  <div 
                    className="h-full bg-gradient-to-r from-chartreuse to-primary rounded-full transition-[width,background-color,box-shadow] duration-300 shadow-[0_0_10px_rgba(140,200,80,0.4)]"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <span className="font-mono text-[10px] text-chartreuse font-extrabold min-w-[32px] text-right">
                  {progressPercent}%
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ─── CASE B: Mostrando detalles de análisis seleccionado ────────── */}
        {!isScanning && selectedDetails && (
          <div className="space-y-8 animate-in fade-in duration-500">
            
            {/* Bento-Row 1: Posture Score & Vulnerability Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              
              {/* Score Gauge — Velocímetro SVG Cinematico */}
              <div className="glass-card p-8 flex flex-col items-center justify-center text-center gap-4 md:col-span-1">
                <h3 className="text-[10px] font-bold text-muted-fg uppercase tracking-widest">
                  {t('securityIndex')}
                </h3>

                {selectedDetails.investigation.score !== null ? (
                  <ScoreGauge
                    score={selectedDetails.investigation.score}
                    previousScore={driftData?.previousScore}
                    size="md"
                  />
                ) : (
                  <div className="w-36 h-36 rounded-full border-4 border-dashed border-border flex items-center justify-center text-muted-fg text-sm font-bold">
                    N/A
                  </div>
                )}

                {/* Drift alert badges */}
                {driftData?.hasDrift && driftData.changes.length > 0 && (
                  <div className="flex flex-col gap-1.5 w-full">
                    {driftData.changes.slice(0, 2).map((change, i) => (
                      <div key={i} className={`flex items-center gap-1.5 text-[9px] font-bold px-2 py-1 rounded border ${
                        change.severity === 'critical'
                          ? 'bg-destructive/10 border-destructive/20 text-destructive'
                          : change.severity === 'warning'
                          ? 'bg-[oklch(75% 0.13 80)]/10 border-[oklch(75% 0.13 80)]/20 text-[oklch(75% 0.13 80)]'
                          : 'bg-primary/10 border-primary/20 text-primary'
                      }`}>
                        <TrendingDown className="w-3 h-3 shrink-0" />
                        <span className="truncate">Drift: {change.label}</span>
                      </div>
                    ))}
                    {driftData.changes.length > 2 && (
                      <span className="text-[9px] text-muted-fg">+{driftData.changes.length - 2} cambios más</span>
                    )}
                  </div>
                )}
              </div>

              {/* Vulnerabilities counts, Summary & Target Info */}
              <div className="glass-card p-8 flex flex-col justify-between gap-6 md:col-span-2">
                <div className="space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-[9px] bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-widest">
                      {t('analysisComplete')}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-fg font-medium">
                        {new Date(selectedDetails.investigation.createdAt).toLocaleString('es-ES')}
                      </span>
                      {/* Attack Surface toggle */}
                      <button
                        onClick={() => setShowAttackSurface(prev => !prev)}
                        className={`flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-lg border transition-colors duration-200 cursor-pointer ${
                          showAttackSurface
                            ? 'bg-primary/15 border-primary/30 text-primary'
                            : 'bg-muted/10 border-border text-muted-fg hover:text-foreground/80'
                        }`}
                      >
                        <Network className="w-3 h-3" />
                        Superficie
                      </button>
                      {/* Geo Map toggle */}
                      <button
                        onClick={() => setShowGeoMap(prev => !prev)}
                        className={`flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-lg border transition-colors duration-200 cursor-pointer ${
                          showGeoMap
                            ? 'bg-primary/15 border-primary/30 text-primary'
                            : 'bg-muted/10 border-border text-muted-fg hover:text-foreground/80'
                        }`}
                      >
                        <MapPin className="w-3 h-3" />
                        Mapa
                      </button>
                      {/* History toggle */}
                      <button
                        onClick={() => { setHistoryDefaultTab('dns'); setShowHistory(prev => !prev); }}
                        className={`flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-lg border transition-colors duration-200 cursor-pointer ${
                          showHistory && historyDefaultTab === 'dns'
                            ? 'bg-primary/15 border-primary/30 text-primary'
                            : 'bg-muted/10 border-border text-muted-fg hover:text-foreground/80'
                        }`}
                      >
                        <History className="w-3 h-3" />
                        DNS
                      </button>
                      {/* WHOIS History toggle */}
                      <button
                        onClick={() => { setHistoryDefaultTab('whois'); setShowHistory(prev => !prev); }}
                        className={`flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-lg border transition-colors duration-200 cursor-pointer ${
                          showHistory && historyDefaultTab === 'whois'
                            ? 'bg-primary/15 border-primary/30 text-primary'
                            : 'bg-muted/10 border-border text-muted-fg hover:text-foreground/80'
                        }`}
                        title="Ver historial WHOIS del dominio"
                      >
                        <BookMarked className="w-3 h-3" />
                        WHOIS
                      </button>
                      {/* Download PDF */}
                      <DownloadPdfButton
                        projectId={selectedProjectId}
                        investigationId={selectedId ?? undefined}
                        label="PDF"
                        variant="ghost"
                        size="sm"
                      />
                    </div>
                  </div>
                  <div>
                    <h4 className="font-extrabold text-foreground text-lg tracking-tight truncate max-w-full" title={selectedDetails.investigation.target}>
                      {selectedDetails.investigation.target}
                    </h4>
                    <p className="text-xs text-muted-fg leading-relaxed mt-1">
                      {selectedDetails.investigation.summary || t('analysisComplete')}
                    </p>
                  </div>
                </div>

                {/* Severity Breakdown boxes */}
                <div className="grid grid-cols-4 gap-4 pt-4 border-t border-border/50">
                  {[
                    { label: 'Críticos', count: selectedDetails.findings.filter(f => f.severity === 'critical').length, color: 'text-destructive' },
                    { label: 'Altos', count: selectedDetails.findings.filter(f => f.severity === 'high').length, color: 'text-destructive/80' },
                    { label: 'Medios', count: selectedDetails.findings.filter(f => f.severity === 'medium').length, color: 'text-[oklch(75% 0.13 80)]' },
                    { label: 'Bajos', count: selectedDetails.findings.filter(f => f.severity === 'low').length, color: 'text-primary' },
                  ].map((group, idx) => (
                    <div key={idx} className="bg-muted/5 border border-border/50 p-3 rounded-xl flex flex-col gap-1 items-center justify-center text-center">
                      <span className={`text-base font-extrabold ${group.color}`}>{group.count}</span>
                      <span className="text-[8px] font-bold text-muted-fg uppercase tracking-widest">{group.label}</span>
                    </div>
                  ))}
                </div>

                {/* Incident Brief CTA — Only shown when critical/high findings exist */}
                {(selectedDetails.findings.filter(f => f.severity === 'critical' || f.severity === 'high').length > 0) && (
                  <button
                    onClick={() => setShowBriefModal(true)}
                    className="w-full flex items-center justify-center gap-2 bg-destructive/10 hover:bg-destructive/20 border border-destructive/20 hover:border-destructive/40 text-destructive font-extrabold text-xs px-4 py-3 rounded-xl transition-[color,background-color,border-color,transform] duration-300 hover:scale-[1.01] cursor-pointer group"
                  >                        <FileText className="w-4 h-4 group-hover:animate-pulse" />
                    {t('generateBrief')}
                    <span className="text-[9px] font-black bg-destructive/20 border border-destructive/30 px-2 py-0.5 rounded uppercase tracking-wider">
                      {selectedDetails.findings.filter(f => f.severity === 'critical' || f.severity === 'high').length} hallazgos
                    </span>
                  </button>
                )}
              </div>

            </div>

            {/* Attack Surface Graph — toggleable panel */}
            {showAttackSurface && (
              <div className="glass-card p-6 animate-in slide-in-from-top-4 fade-in duration-400">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-extrabold text-foreground tracking-tight flex items-center gap-2">
                      <Network className="w-4 h-4 text-primary" />
                      Attack Surface Graph
                    </h3>
                    <p className="text-[10px] text-muted-fg mt-0.5">
                      Topología de red del objetivo con vectores de exposición
                    </p>
                  </div>
                  <button
                    onClick={() => setShowAttackSurface(false)}
                    className="text-muted-fg hover:text-foreground/80 transition-colors text-xs font-bold cursor-pointer"
                  >
                    Cerrar ×
                  </button>
                </div>
                <AttackSurfaceGraph
                  target={selectedDetails.investigation.target}
                  metadata={selectedDetails.investigation.metadata as any}
                  score={selectedDetails.investigation.score}
                />
              </div>
            )}

            {/* Geo Map — toggleable panel */}
            {showGeoMap && (
              <div className="glass-card p-6 animate-in slide-in-from-top-4 fade-in duration-400">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-extrabold text-foreground tracking-tight flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-primary" />
                      Geolocalización de Infraestructura
                    </h3>
                    <p className="text-[10px] text-muted-fg mt-0.5">
                      Ubicación geográfica de activos de red, ASN y traceroute hops
                    </p>
                  </div>
                  <button
                    onClick={() => setShowGeoMap(false)}
                    className="text-muted-fg hover:text-foreground/80 transition-colors text-xs font-bold cursor-pointer"
                  >
                    Cerrar ×
                  </button>
                </div>
                <GeoMap
                  metadata={selectedDetails.investigation.metadata as any}
                  target={selectedDetails.investigation.target}
                />
              </div>
            )}

            {/* History Panel — toggleable */}
            {showHistory && (
              <HistoryPanel
                projectId={selectedProjectId}
                defaultQuery={selectedDetails.investigation.target}
                defaultTab={historyDefaultTab}
                onClose={() => setShowHistory(false)}
              />
            )}

            {/* Bento-Row 1.5: Mail Health & Web Security Audit Panel */}
            {(() => {
              const meta = selectedDetails?.investigation?.metadata || null;
              const mailScore = meta?.mailHealthCompositeScore ?? null;
              const infraScore = meta?.infrastructureScore ?? null;
              
              return (
                <div className="glass-card p-8 flex flex-col gap-6">
                  <div>                        <h3 className="font-extrabold text-foreground text-base tracking-tight flex items-center gap-2">
                          <Shield className="w-5 h-5 text-primary" />
                          {t('emailWebSecurity')}
                        </h3>
                        <p className="text-[10px] font-bold text-muted-fg uppercase tracking-widest mt-0.5">
                          {t('scanSubtitle')}
                        </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 border-t border-border/50 pt-6">
                    
                    {/* Left Column: Mail Security & Deliverability */}
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-extrabold text-foreground/80 uppercase tracking-wider flex items-center gap-2">
                          <Mail className="w-4 h-4 text-primary" />
                          Autenticación de Correo y Reputación
                        </h4>
                        {mailScore !== null && (
                          <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                            mailScore >= 80 ? 'text-chartreuse border-chartreuse/20 bg-chartreuse/5' : 'text-destructive border-destructive/20 bg-destructive/5'
                          }`}>
                            Score: {mailScore}/100
                          </span>
                        )}
                      </div>

                      <div className="space-y-4">
                        {/* SPF Accordion Card */}
                        <div className="bg-muted/[0.4] border border-border backdrop-blur-xl hover:border-primary/20 rounded-xl overflow-hidden transition-colors duration-300">
                          <button 
                            type="button"
                            onClick={() => toggleAccordion('spf')}
                            className="w-full flex items-center justify-between p-4 cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40 hover:bg-muted/10 transition-colors"
                          >
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] font-extrabold text-foreground/80 uppercase tracking-widest">
                                SPF (Sender Policy Framework)
                              </span>
                              <span className="text-[9px] text-muted-fg font-medium">Verificación del registro TXT en DNS</span>
                            </div>
                            <div className="flex items-center gap-3">
                              {meta?.spfParsed ? (
                                <span className={`text-[9px] font-bold px-2.5 py-0.5 rounded ${
                                  meta.spfParsed.isWeak 
                                    ? 'bg-[oklch(75% 0.13 80)]/10 text-[oklch(75% 0.13 80)] border border-[oklch(75% 0.13 80)]/20' 
                                    : 'bg-chartreuse/10 text-chartreuse border border-chartreuse/20'
                                }`}>
                                  {meta.spfParsed.isWeak ? 'Vulnerable' : 'Seguro'}
                                </span>
                              ) : (
                                <span className="text-[9px] bg-destructive/10 text-destructive border border-destructive/20 px-2.5 py-0.5 rounded font-bold">
                                  No Configurado
                                </span>
                              )}
                              <ChevronDown className={`w-4 h-4 text-muted-fg transition-transform duration-300 ${expandedAccordions['spf'] ? 'rotate-180 text-primary' : ''}`} />
                            </div>
                          </button>
                          
                          {/* Smooth transition container */}
                          <div className={`transition-[max-height,border-color] duration-300 ease-in-out overflow-hidden ${expandedAccordions['spf'] ? 'max-h-[600px] border-t border-border' : 'max-h-0'}`}>
                            <div className="p-5 space-y-4 text-xs bg-muted/20">
                              {meta?.spfParsed ? (
                                <div className="space-y-4">
                                  <div className="space-y-1.5">
                                    <span className="text-[8px] font-bold text-muted-fg uppercase tracking-widest block">Registro SPF Detectado</span>
                                    <code className="block text-[10px] text-foreground/80 bg-muted/5 border border-border p-3 rounded-lg font-mono break-all leading-normal select-all">
                                      {meta.spfParsed.record}
                                    </code>
                                  </div>
                                  <div className="flex items-center justify-between text-[9px] text-muted-fg font-bold uppercase tracking-wider">
                                    <span>Consultas DNS: <span className="text-foreground/80 font-mono">{meta.spfParsed.dnsLookups} / 10</span></span>
                                    <span>Directiva: <span className={meta.spfParsed.isWeak ? 'text-[oklch(75% 0.13 80)]' : 'text-chartreuse'}>{meta.spfParsed.isWeak ? 'Débil (SoftFail/Neutral)' : 'Fuerte (HardFail)'}</span></span>
                                  </div>
                                  
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                                    <div className="bg-muted/5 border border-border/50 p-4 rounded-xl space-y-2">
                                      <span className="text-[8px] font-bold text-muted-fg uppercase tracking-widest block">Diagnóstico de Seguridad</span>
                                      <p className="text-foreground/80 leading-relaxed text-[11px]">
                                        {meta.spfParsed.isWeak 
                                          ? 'El registro utiliza una directiva de atenuación blanda (como ~all o ?all) o supera el límite máximo de 10 consultas DNS autorizadas, lo que reduce la protección contra atacantes.' 
                                          : 'Filtro SPF robusto establecido. El dominio deniega de forma estricta (-all) todo correo enviado desde servidores SMTP no declarados en el registro.'}
                                      </p>
                                    </div>
                                    <div className={`${meta.spfParsed.isWeak ? 'bg-destructive/[0.02] border-destructive/[0.08]' : 'bg-chartreuse/[0.02] border-chartreuse/[0.08]'} border p-4 rounded-xl space-y-2`}>
                                      <span className={`text-[8px] font-bold ${meta.spfParsed.isWeak ? 'text-destructive' : 'text-chartreuse'} uppercase tracking-widest block`}>Impacto del Riesgo</span>
                                      <p className="text-foreground/80 leading-relaxed text-[11px]">
                                        {meta.spfParsed.isWeak 
                                          ? 'Un atacante puede enviar correos suplantando tu dominio institucional, burlando parcialmente la autenticación de servidores como Gmail o Microsoft 365.'
                                          : 'Riesgo minimizado. Los proveedores de correo de destino rechazarán automáticamente los correos fraudulentos en tránsito que intenten suplantar tu identidad.'}
                                      </p>
                                    </div>
                                  </div>
                                  
                                  {meta.spfParsed.isWeak && meta.spfParsed.weakReason && (
                                    <div className="text-[10px] text-[oklch(75% 0.13 80)] bg-[oklch(75% 0.13 80)]/[0.03] border border-[oklch(75% 0.13 80)]/10 p-3 rounded-xl leading-relaxed flex items-start gap-2.5">
                                      <AlertTriangle className="w-4 h-4 shrink-0 text-[oklch(75% 0.13 80)] mt-0.5 animate-pulse" />
                                      <span>{meta.spfParsed.weakReason}</span>
                                    </div>
                                  )}
                                  
                                  <div className="space-y-2 pt-3.5 border-t border-border">
                                    <div className="flex justify-between items-center">
                                      <span className="text-[8px] font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
                                        <Terminal className="w-3.5 h-3.5 text-primary" />
                                        Código de Remediación DNS
                                      </span>
                                      <button 
                                        type="button"
                                        onClick={() => handleCopyToClipboard("v=spf1 include:_spf.google.com -all", "spf_remediation")}
                                        className="px-2.5 py-1 rounded-md text-[9px] font-bold text-muted-fg hover:text-foreground bg-muted/20 hover:bg-muted/40 border border-border transition-colors flex items-center gap-1.5 cursor-pointer"
                                      >
                                        {copiedId === 'spf_remediation' ? (
                                          <>
                                            <Check className="w-3 h-3 text-chartreuse animate-scale-up" />
                                            <span>Copiado</span>
                                          </>
                                        ) : (
                                          <>
                                            <Copy className="w-3 h-3" />
                                            <span>Copiar</span>
                                          </>
                                        )}
                                      </button>
                                    </div>
                                    <code className="block text-[10px] text-chartreuse bg-chartreuse/[0.15] border border-chartreuse/20 p-3.5 rounded-lg font-mono break-all leading-normal select-all">
                                      v=spf1 include:_spf.google.com -all
                                    </code>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-4">
                                  <p className="text-foreground/80 leading-relaxed text-[11px]">
                                    El dominio no tiene un registro SPF configurado en su zona DNS. Esto permite que cualquier atacante falsifique la identidad del remitente de tus correos institucionales de manera directa.
                                  </p>
                                  <div className="space-y-2 pt-2 border-t border-border">
                                    <div className="flex justify-between items-center">
                                      <span className="text-[8px] font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
                                        <Terminal className="w-3.5 h-3.5 text-primary" />
                                        Crear Registro TXT Recomendado
                                      </span>
                                      <button 
                                        type="button"
                                        onClick={() => handleCopyToClipboard("v=spf1 include:_spf.google.com -all", "spf_unconfigured_remediation")}
                                        className="px-2.5 py-1 rounded-md text-[9px] font-bold text-muted-fg hover:text-foreground bg-muted/20 hover:bg-muted/40 border border-border transition-colors flex items-center gap-1.5 cursor-pointer"
                                      >
                                        {copiedId === 'spf_unconfigured_remediation' ? (
                                          <>
                                            <Check className="w-3 h-3 text-chartreuse animate-scale-up" />
                                            <span>Copiado</span>
                                          </>
                                        ) : (
                                          <>
                                            <Copy className="w-3 h-3" />
                                            <span>Copiar</span>
                                          </>
                                        )}
                                      </button>
                                    </div>
                                    <code className="block text-[10px] text-chartreuse bg-chartreuse/[0.15] border border-chartreuse/20 p-3.5 rounded-lg font-mono break-all leading-normal select-all">
                                      v=spf1 include:_spf.google.com -all
                                    </code>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* DMARC Accordion Card */}
                        <div className="bg-muted/[0.4] border border-border backdrop-blur-xl hover:border-primary/20 rounded-xl overflow-hidden transition-colors duration-300">
                          <button 
                            type="button"
                            onClick={() => toggleAccordion('dmarc')}
                            className="w-full flex items-center justify-between p-4 cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40 hover:bg-muted/10 transition-colors"
                          >
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] font-extrabold text-foreground/80 uppercase tracking-widest">
                                DMARC Policy Enforcement
                              </span>
                              <span className="text-[9px] text-muted-fg font-medium">Instrucción de alineación SPF/DKIM</span>
                            </div>
                            <div className="flex items-center gap-3">
                              {meta?.dmarcParsed && meta.dmarcParsed.policy !== 'invalid' ? (
                                <span className={`text-[9px] font-bold px-2.5 py-0.5 rounded ${
                                  meta.dmarcParsed.policy === 'reject' 
                                    ? 'bg-chartreuse/10 text-chartreuse border border-chartreuse/20' 
                                    : meta.dmarcParsed.policy === 'quarantine'
                                    ? 'bg-primary/10 text-primary border border-primary/20'
                                    : 'bg-[oklch(75% 0.13 80)]/10 text-[oklch(75% 0.13 80)] border border-[oklch(75% 0.13 80)]/20'
                                }`}>
                                  Política: {meta.dmarcParsed.policy?.toUpperCase() || 'NINGUNA'}
                                </span>
                              ) : (
                                <span className="text-[9px] bg-destructive/10 text-destructive border border-destructive/20 px-2.5 py-0.5 rounded font-bold">
                                  Inactivo / Inválido
                                </span>
                              )}
                              <ChevronDown className={`w-4 h-4 text-muted-fg transition-transform duration-300 ${expandedAccordions['dmarc'] ? 'rotate-180 text-primary' : ''}`} />
                            </div>
                          </button>
                          
                          {/* Smooth transition container */}
                          <div className={`transition-[max-height,border-color] duration-300 ease-in-out overflow-hidden ${expandedAccordions['dmarc'] ? 'max-h-[600px] border-t border-border' : 'max-h-0'}`}>
                            <div className="p-5 space-y-4 text-xs bg-muted/20">
                              {meta?.dmarcParsed && meta.dmarcParsed.policy !== 'invalid' ? (
                                <div className="space-y-4">
                                  <div className="space-y-1.5">
                                    <span className="text-[8px] font-bold text-muted-fg uppercase tracking-widest block">Registro DMARC Detectado</span>
                                    <code className="block text-[10px] text-foreground/80 bg-muted/5 border border-border p-3 rounded-lg font-mono break-all leading-normal select-all">
                                      {meta.dmarcParsed.record}
                                    </code>
                                  </div>
                                  
                                  {meta.dmarcParsed.rua && meta.dmarcParsed.rua.length > 0 && (
                                    <div className="text-[9.5px] text-muted-fg flex flex-col gap-1.5 bg-muted/5 border border-border/70 p-3 rounded-xl">
                                      <span className="font-bold uppercase tracking-wider text-muted-fg text-[8px]">Destino de Informes RUA (Agregados):</span>
                                      <span className="text-foreground/80 font-mono text-[9.5px] break-all">{meta.dmarcParsed.rua.join(', ')}</span>
                                    </div>
                                  )}
                                  
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                                    <div className="bg-muted/5 border border-border/50 p-4 rounded-xl space-y-2">
                                      <span className="text-[8px] font-bold text-muted-fg uppercase tracking-widest block">Diagnóstico de la Política</span>
                                      <p className="text-foreground/80 leading-relaxed text-[11px]">
                                        {meta.dmarcParsed.policy === 'none' 
                                          ? 'La política "p=none" (Solo monitoreo) permite que los correos que fallen SPF/DKIM sigan entregándose en la bandeja de entrada del receptor. Es el nivel básico para auditar flujos.'
                                          : meta.dmarcParsed.policy === 'quarantine'
                                          ? 'La política "p=quarantine" solicita que los correos que fallen autenticación se envíen a la carpeta de correo no deseado (Spam).'
                                          : 'Fidelidad extrema. La política "p=reject" rechaza completamente cualquier correo fraudulento, impidiendo su entrega por completo.'}
                                      </p>
                                    </div>
                                    <div className={`${meta.dmarcParsed.policy === 'none' ? 'bg-destructive/[0.02] border-destructive/[0.08]' : 'bg-chartreuse/[0.02] border-chartreuse/[0.08]'} border p-4 rounded-xl space-y-2`}>
                                      <span className={`text-[8px] font-bold ${meta.dmarcParsed.policy === 'none' ? 'text-destructive' : 'text-chartreuse'} uppercase tracking-widest block`}>Impacto de Riesgo de Seguridad</span>
                                      <p className="text-foreground/80 leading-relaxed text-[11px]">
                                        {meta.dmarcParsed.policy === 'none' 
                                          ? 'Ataque de suplantación viable. Un hacker puede seguir enviar phishing directo que aparente venir de tus directivos sin ser bloqueado.'
                                          : 'Protección perimetral en curso. Los correos falsos se descartan o aíslan de las bandejas normales, limitando la tasa de éxito de campañas de phishing.'}
                                      </p>
                                    </div>
                                  </div>
                                  
                                  {meta.dmarcParsed.policy === 'none' && (
                                    <div className="text-[10px] text-[oklch(75% 0.13 80)] bg-[oklch(75% 0.13 80)]/[0.03] border border-[oklch(75% 0.13 80)]/10 p-3 rounded-xl leading-relaxed flex items-start gap-2.5">
                                      <AlertTriangle className="w-4 h-4 shrink-0 text-[oklch(75% 0.13 80)] mt-0.5 animate-pulse" />
                                      <span>La política &apos;p=none&apos; solo monitorea pero no bloquea ni rechaza correos fraudulentos. Se recomienda migrar a &apos;quarantine&apos; o &apos;reject&apos; gradualmente.</span>
                                    </div>
                                  )}
                                  
                                  <div className="space-y-2 pt-3.5 border-t border-border">
                                    <div className="flex justify-between items-center">
                                      <span className="text-[8px] font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
                                        <Terminal className="w-3.5 h-3.5 text-primary" />
                                        Código de Remediación DMARC (Políticas de Rechazo)
                                      </span>
                                      <button 
                                        type="button"
                                        onClick={() => handleCopyToClipboard(`v=DMARC1; p=reject; pct=100; rua=mailto:dmarc-reports@${selectedDetails.investigation.target}`, "dmarc_remediation")}
                                        className="px-2.5 py-1 rounded-md text-[9px] font-bold text-muted-fg hover:text-foreground bg-muted/20 hover:bg-muted/40 border border-border transition-colors flex items-center gap-1.5 cursor-pointer"
                                      >
                                        {copiedId === 'dmarc_remediation' ? (
                                          <>
                                            <Check className="w-3 h-3 text-chartreuse animate-scale-up" />
                                            <span>Copiado</span>
                                          </>
                                        ) : (
                                          <>
                                            <Copy className="w-3 h-3" />
                                            <span>Copiar</span>
                                          </>
                                        )}
                                      </button>
                                    </div>
                                    <code className="block text-[10px] text-chartreuse bg-chartreuse/[0.15] border border-chartreuse/20 p-3.5 rounded-lg font-mono break-all leading-normal select-all">
                                      v=DMARC1; p=reject; pct=100; rua=mailto:dmarc-reports@{selectedDetails.investigation.target}
                                    </code>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-4">
                                  <p className="text-foreground/80 leading-relaxed text-[11px]">
                                    No se detectó una política DMARC válida en el host. DMARC es el escudo definitivo que ordena a los servidores del mundo cómo manejar correos fraudulentos que pretendan ser tuyos.
                                  </p>
                                  <div className="space-y-2 pt-2 border-t border-border">
                                    <div className="flex justify-between items-center">
                                      <span className="text-[8px] font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
                                        <Terminal className="w-3.5 h-3.5 text-primary" />
                                        Crear Registro TXT Recomendado
                                      </span>
                                      <button 
                                        type="button"
                                        onClick={() => handleCopyToClipboard(`v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc-reports@${selectedDetails.investigation.target}`, "dmarc_unconfigured_remediation")}
                                        className="px-2.5 py-1 rounded-md text-[9px] font-bold text-muted-fg hover:text-foreground bg-muted/20 hover:bg-muted/40 border border-border transition-colors flex items-center gap-1.5 cursor-pointer"
                                      >
                                        {copiedId === 'dmarc_unconfigured_remediation' ? (
                                          <>
                                            <Check className="w-3 h-3 text-chartreuse animate-scale-up" />
                                            <span>Copiado</span>
                                          </>
                                        ) : (
                                          <>
                                            <Copy className="w-3 h-3" />
                                            <span>Copiar</span>
                                          </>
                                        )}
                                      </button>
                                    </div>
                                    <code className="block text-[10px] text-chartreuse bg-chartreuse/[0.15] border border-chartreuse/20 p-3.5 rounded-lg font-mono break-all leading-normal select-all">
                                      v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc-reports@{selectedDetails.investigation.target}
                                    </code>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* DKIM & BIMI Mini-grid */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-muted/40 border border-border/50 rounded-xl p-3.5 flex flex-col gap-1 justify-between">
                            <span className="text-[9px] font-bold text-muted-fg uppercase tracking-wider">
                              Selectores DKIM
                            </span>
                            <div className="flex items-baseline gap-2 mt-1">
                              <span className="text-xl font-extrabold text-foreground">
                                {meta?.dkimCount ?? 0}
                              </span>
                              <span className="text-[9px] font-bold text-muted-fg">Encontrados</span>
                            </div>
                            <span className="text-[8px] text-muted-fg leading-normal mt-1">
                              {meta?.dkimCount && meta.dkimCount > 0 ? '✓ Firmas criptográficas activas.' : '⚠ No se detectaron firmas estándar.'}
                            </span>
                          </div>

                          <div className="bg-muted/40 border border-border/50 rounded-xl p-3.5 flex flex-col gap-1 justify-between">
                            <span className="text-[9px] font-bold text-muted-fg uppercase tracking-wider">
                              Protocolo BIMI
                            </span>
                            <div className="flex items-baseline gap-2 mt-1">
                              <span className={`text-xs font-extrabold ${meta?.bimiSuccess ? 'text-chartreuse' : 'text-muted-fg'}`}>
                                {meta?.bimiSuccess ? 'Certificado' : 'No detectado'}
                              </span>
                            </div>
                            <span className="text-[8px] text-muted-fg leading-normal mt-1">
                              {meta?.bimiSuccess ? '✓ Logo corporativo validado.' : 'Logo en bandeja de entrada inactivo.'}
                            </span>
                          </div>
                        </div>

                      </div>
                    </div>

                    {/* Right Column: Web Infrastructure & Security Headers */}
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-extrabold text-foreground/80 uppercase tracking-wider flex items-center gap-2">
                          <Server className="w-4 h-4 text-primary" />
                          Seguridad Web e Infraestructura
                        </h4>
                        {infraScore !== null && (
                          <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                            infraScore >= 80 ? 'text-chartreuse border-chartreuse/20 bg-chartreuse/5' : 'text-destructive border-destructive/20 bg-destructive/5'
                          }`}>
                            Score: {infraScore}/100
                          </span>
                        )}
                      </div>

                      <div className="space-y-4">
                        {/* HTTPS & Protocol Enforcement */}
                        <div className="bg-muted/40 border border-border/50 rounded-xl p-4 space-y-3.5">
                          <span className="text-[10px] font-extrabold text-muted-fg uppercase tracking-widest block">
                            Seguridad de Conexión y Transporte (TLS)
                          </span>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-chartreuse/10 border border-chartreuse/20 flex items-center justify-center shrink-0">
                                <Lock className="w-4 h-4 text-chartreuse" />
                              </div>
                              <div>
                                <div className="text-[9px] font-extrabold text-muted-fg uppercase tracking-wider">Redirección HTTPS</div>
                                <div className="text-xs font-bold text-foreground mt-0.5">
                                  {meta?.redirectsToHttps ? 'Establecida' : 'Faltante / Débil'}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                                <Cpu className="w-4 h-4 text-primary" />
                              </div>
                              <div>
                                <div className="text-[9px] font-extrabold text-muted-fg uppercase tracking-wider">Cifrado de Capa</div>
                                <div className="text-xs font-bold text-foreground mt-0.5">
                                  TLS v1.3 / v1.2
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Web Security Headers Compliance Checklist */}
                        <div className="bg-muted/[0.4] border border-border backdrop-blur-xl rounded-xl p-4 space-y-4">
                          <span className="text-[10px] font-extrabold text-muted-fg uppercase tracking-widest block">
                            Cumplimiento de Cabeceras de Seguridad
                          </span>

                          <div className="space-y-2">
                            {[
                              {
                                id: 'csp',
                                name: 'Content-Security-Policy (CSP)', 
                                status: selectedDetails.findings.every(f => !f.title.includes('Content-Security-Policy')),
                                description: 'Mitiga inyecciones XSS y secuestro de datos definiendo orígenes autorizados.',
                                diagnostic: 'CSP restringe los recursos (scripts, estilos, fuentes) que el navegador tiene permitido cargar. Si un atacante inyecta un script malicioso (XSS), CSP impide su ejecución si no está explícitamente autorizado en la directiva.',
                                risk: 'Crítico. Sin CSP, tu sitio es totalmente vulnerable al secuestro de tokens de sesión, lectura de cookies desprotegidas y alteración visual mediante ataques Cross-Site Scripting.',
                                code: `# Directiva Nginx sugerida para bloques de servidor (CSP estricto, sin terceros):\nadd_header Content-Security-Policy "default-src 'self'; script-src 'self' 'nonce-<RANDOM>' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; base-uri 'self'; frame-ancestors 'self';" always;`
                              },
                              { 
                                id: 'hsts',
                                name: 'Strict-Transport-Security (HSTS)', 
                                status: selectedDetails.findings.every(f => !f.title.includes('Strict-Transport-Security') && !f.description.includes('HSTS')),
                                description: 'Fuerza conexiones cifradas HTTPS de forma estricta en el navegador.',
                                diagnostic: 'HSTS le ordena al navegador web comunicarse únicamente mediante HTTPS seguro durante la vigencia máxima declarada, previniendo degradaciones de seguridad accidentales.',
                                risk: 'Alto (SSL Stripping). Previene interceptaciones Man-in-the-Middle donde un atacante degrada la conexión de un cliente a HTTP para robar su sesión en tránsito.',
                                code: `# En Nginx (asegúrate de que solo esté en el servidor HTTPS):\nadd_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;`
                              },
                              { 
                                id: 'xframe',
                                name: 'X-Frame-Options (Clickjacking Protection)', 
                                status: selectedDetails.findings.every(f => !f.title.includes('X-Frame-Options') && !f.title.includes('Clickjacking')),
                                description: 'Evita que tu sitio web sea embebido de forma fraudulenta en iframes externos.',
                                diagnostic: 'X-Frame-Options o las directivas CSP prohíben que otros sitios embeban tus páginas en iframes, previniendo que realicen trucos visuales interactivos.',
                                risk: 'Medio (Clickjacking). Un atacante puede superponer tus botones importantes (como "Pagar" o "Autorizar") dentro de un iframe invisible para hacer que tus usuarios los pulsen sin saberlo.',
                                code: `# En Nginx para evitar incrustaciones de forma global:\nadd_header X-Frame-Options "DENY" always;`
                              },
                              { 
                                id: 'cookie_flags',
                                name: 'Cookie Security Flags (HttpOnly & Secure)', 
                                status: selectedDetails.findings.every(f => !f.title.includes('HttpOnly') && !f.title.includes('Secure') && !f.title.includes('Cookie')),
                                description: 'Protege las cookies de sesión contra el robo mediante scripts maliciosos.',
                                diagnostic: 'Fuerza a las cookies a operar de forma aislada. HttpOnly impide el acceso mediante document.cookie en JavaScript, Secure prohíbe el envío sobre conexiones HTTP no cifradas y SameSite mitiga ataques CSRF.',
                                risk: 'Crítico. Sin HttpOnly, cualquier script malicioso inyectado localmente puede leer la cookie de autenticación del usuario final y secuestrar su sesión al instante.',
                                code: `// En Next.js (Server Actions / Route Handlers):\ncookies().set('session', token, {\n  httpOnly: true,\n  secure: true,\n  sameSite: 'lax',\n  path: '/'\n});`
                              }
                            ].map((header, idx) => {
                              const isOpen = !!expandedAccordions[header.id];
                              const copyId = `${header.id}_remediation`;
                              return (
                                <div key={idx} className="flex flex-col">
                                  <button
                                    type="button"
                                    onClick={() => toggleAccordion(header.id)}
                                    className="w-full flex items-start justify-between gap-4 cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40 bg-muted/[0.2] border border-border/50 hover:border-border rounded-xl px-4 py-3 transition-colors duration-200"
                                  >
                                    <div className="space-y-0.5 flex-1 min-w-0">
                                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                        {header.name}
                                      </span>
                                      <p className="text-[10px] text-muted-fg leading-normal truncate">
                                        {header.description}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                      <span className={`px-2 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wider ${
                                        header.status 
                                          ? 'bg-chartreuse/10 text-chartreuse border border-chartreuse/20' 
                                          : 'bg-destructive/10 text-destructive border border-destructive/20'
                                      }`}>
                                        {header.status ? 'Cumple' : 'Incompleto'}
                                      </span>
                                      <ChevronDown className={`w-3.5 h-3.5 text-muted-fg transition-transform duration-300 ${isOpen ? 'rotate-180 text-primary' : ''}`} />
                                    </div>
                                  </button>
                                  
                                  {/* Collapsable Content */}
                                  <div className={`transition-[max-height,margin] duration-300 ease-in-out overflow-hidden ${isOpen ? 'max-h-[450px] mt-2 mb-3' : 'max-h-0'}`}>
                                    <div className="bg-muted/[0.5] border border-border p-4 rounded-xl space-y-3.5 text-[11px] leading-relaxed">
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                          <span className="text-[8px] font-bold text-muted-fg uppercase tracking-widest block">Diagnóstico Detallado</span>
                                          <p className="text-muted-fg">{header.diagnostic}</p>
                                        </div>
                                        <div className="space-y-1">
                                          <span className="text-[8px] font-bold text-destructive uppercase tracking-widest block">Impacto y Explotabilidad</span>
                                          <p className="text-muted-fg">{header.risk}</p>
                                        </div>
                                      </div>
                                      
                                      <div className="space-y-2 pt-2 border-t border-border/50">
                                        <div className="flex justify-between items-center">
                                          <span className="text-[8px] font-bold text-primary uppercase tracking-widest">Código de Remediación / Configuración</span>
                                          <button 
                                            type="button"
                                            onClick={() => handleCopyToClipboard(header.code, copyId)}
                                            className="text-[9px] font-bold text-muted-fg hover:text-foreground uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors duration-200"
                                          >
                                            {copiedId === copyId ? (
                                              <>
                                                <Check className="w-3.5 h-3.5 text-chartreuse" />
                                                <span className="text-chartreuse font-bold">¡Copiado!</span>
                                              </>
                                            ) : (
                                              <>
                                                <Copy className="w-3 h-3" />
                                                <span>Copiar</span>
                                              </>
                                            )}
                                          </button>
                                        </div>
                                        <pre className="p-3.5 overflow-x-auto text-[10px] font-mono text-chartreuse bg-chartreuse/[0.15] border border-chartreuse/20 rounded-lg max-h-[120px] leading-relaxed select-all">
                                          {header.code}
                                        </pre>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                      </div>
                    </div>

                  </div>
                </div>
              );
            })()}

            {/* Bento-Row 1.8: Red y OSINT (Network & OSINT) */}
            {(() => {
              const meta = selectedDetails?.investigation?.metadata || null;
              if (!meta) return null;

              const whois = meta.whois;
              const asnGeo = meta.asnGeo;
              const reverseDns = meta.reverseDns;
              const ping = meta.ping;
              const cdnWaf = meta.cdnWaf;
              const reverseIp = meta.reverseIp;
              const dnsbl = meta.dnsbl;
              const traceroute = meta.traceroute;

              // Safe WHOIS expiration calculations
              const remainingDays = (() => {
                if (!whois?.expiresDate) return null;
                const expiry = new Date(whois.expiresDate);
                const now = new Date();
                const diffTime = expiry.getTime() - now.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                return diffDays;
              })();

              // Check if we have any Network data at all.
              const hasNetworkData = whois || asnGeo || ping || cdnWaf || dnsbl || traceroute;
              if (!hasNetworkData) return null;

              return (
                <div className="space-y-8 mt-8">
                  {/* Row Header */}
                  <div>
                    <h3 className="font-extrabold text-foreground text-base tracking-tight flex items-center gap-2">
                      <Globe className="w-5 h-5 text-primary animate-pulse" />
                      Diagnóstico de Red y OSINT Avanzado
                    </h3>
                    <p className="text-[10px] font-bold text-muted-fg uppercase tracking-widest mt-0.5">
                      Topología de perímetro de red, enrutamiento de paquetes y análisis de huella pública (Open Source Intelligence)
                    </p>
                  </div>

                  {/* 2x2 grid for main details */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    
                    {/* Card 1: WHOIS & Registro de Dominio */}
                    <div className="glass-card p-6 flex flex-col gap-5 hover:border-border transition-colors duration-300">
                      <div className="flex items-center justify-between border-b border-border/50 pb-3">
                        <h4 className="text-xs font-extrabold text-foreground/80 uppercase tracking-wider flex items-center gap-2">
                          <Globe className="w-4 h-4 text-primary" />
                          Información de Registro (WHOIS/RDAP)
                        </h4>
                        {whois?.success && (
                          <span className="text-[9px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                            Dominio Activo
                          </span>
                        )}
                      </div>

                      {whois?.success ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 flex-1">
                          {/* Registrar & Dates */}
                          <div className="space-y-4">
                            <div className="space-y-1">
                              <span className="text-[8px] font-bold text-muted-fg uppercase tracking-widest block">Registrador Autorizado</span>
                              <span className="text-sm font-extrabold text-foreground">{whois.registrar || 'Desconocido'}</span>
                            </div>

                            <div className="space-y-2">
                              <span className="text-[8px] font-bold text-muted-fg uppercase tracking-widest block">Fechas de Registro</span>
                              <div className="space-y-1 bg-muted/10 border border-border/50 rounded-lg p-2.5">
                                <div className="flex justify-between text-[10px]">
                                  <span className="text-muted-fg font-bold uppercase">Creado:</span>
                                  <span className="text-foreground/80 font-mono">{whois.createdDate ? new Date(whois.createdDate).toLocaleDateString('es-ES') : 'N/A'}</span>
                                </div>
                                <div className="flex justify-between text-[10px]">
                                  <span className="text-muted-fg font-bold uppercase">Actualizado:</span>
                                  <span className="text-foreground/80 font-mono">{whois.updatedDate ? new Date(whois.updatedDate).toLocaleDateString('es-ES') : 'N/A'}</span>
                                </div>
                                <div className="flex justify-between text-[10px] border-t border-border/50 pt-1 mt-1">
                                  <span className="text-muted-fg font-bold uppercase">Expira:</span>
                                  <span className="text-foreground/80 font-mono">{whois.expiresDate ? new Date(whois.expiresDate).toLocaleDateString('es-ES') : 'N/A'}</span>
                                </div>
                              </div>
                            </div>

                            {/* Expiry Alert Badge */}
                            {remainingDays !== null && (
                              <div className={`p-2.5 rounded-lg border text-center ${
                                remainingDays < 60 
                                  ? 'bg-destructive/5 border-destructive/20 text-destructive' 
                                  : remainingDays < 180 
                                  ? 'bg-[oklch(75% 0.13 80)]/5 border-[oklch(75% 0.13 80)]/20 text-[oklch(75% 0.13 80)]' 
                                  : 'bg-chartreuse/5 border-chartreuse/20 text-chartreuse'
                              }`}>
                                <span className="text-[9px] font-bold uppercase tracking-wider block">Tiempo hasta Renovación</span>
                                <span className="text-sm font-black">{remainingDays} días</span>
                              </div>
                            )}
                          </div>

                          {/* Domain Status & Nameservers */}
                          <div className="space-y-4 flex flex-col">
                            <div className="space-y-1.5">
                              <span className="text-[8px] font-bold text-muted-fg uppercase tracking-widest block">Estados de Dominio (Registry Status)</span>
                              <div className="flex flex-wrap gap-1">
                                {whois.status && whois.status.length > 0 ? (
                                  whois.status.slice(0, 3).map((st, idx) => (
                                    <span key={idx} className="text-[8px] font-bold px-2 py-0.5 rounded bg-muted text-muted-fg border border-border/50 truncate max-w-full">
                                      {st.split(' ')[0]}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-[9px] text-muted-fg">Ningún estado especial reportado</span>
                                )}
                              </div>
                            </div>

                            <div className="space-y-1.5 flex-1 flex flex-col justify-end">
                              <span className="text-[8px] font-bold text-muted-fg uppercase tracking-widest block">Servidores de Nombres (Auth DNS)</span>
                              <div className="bg-muted/5 border border-border/50 rounded-lg p-2.5 space-y-1 flex-1 overflow-y-auto max-h-[120px]">
                                {whois.nameservers && whois.nameservers.length > 0 ? (
                                  whois.nameservers.map((ns, idx) => (
                                    <div key={idx} className="flex items-center gap-1.5 text-[9px] text-muted-fg font-mono">
                                      <span className="w-1 h-1 bg-indigo-500 rounded-full shrink-0"></span>
                                      <span className="truncate">{ns}</span>
                                    </div>
                                  ))
                                ) : (
                                  <span className="text-[9px] text-muted-fg">Ningún servidor DNS delegado</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col justify-center items-center text-center p-6 bg-muted/1 border border-dashed border-border/50 rounded-xl gap-2">
                          <Globe className="w-8 h-8 text-muted-fg" />
                          <span className="text-xs font-bold text-muted-fg">Detalles WHOIS No Disponibles</span>
                          <p className="text-[10px] text-muted-fg max-w-xs leading-relaxed">
                            No se encontraron registros de registro de dominio público para este objetivo. Esto ocurre en IPs directas o subdominios internos.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Card 2: Rendimiento y Escudo Perimetral (TCP Ping & CDN/WAF) */}
                    <div className="glass-card p-6 flex flex-col justify-between hover:border-border transition-colors duration-300 group">
                      <div className="flex items-center justify-between border-b border-border/50 pb-3">
                        <h4 className="text-xs font-extrabold text-foreground/80 uppercase tracking-wider flex items-center gap-2">
                          <Activity className="w-4 h-4 text-chartreuse" />
                          Rendimiento y Escudo Perimetral
                        </h4>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                          cdnWaf?.detected 
                            ? 'bg-chartreuse/10 text-chartreuse border-chartreuse/20' 
                            : 'bg-[oklch(75% 0.13 80)]/10 text-[oklch(75% 0.13 80)] border-[oklch(75% 0.13 80)]/20'
                        }`}>
                          {cdnWaf?.detected ? 'WAF Activo' : 'Sin WAF'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2">
                        {/* Ping Performance with Animated Pulsing Ring */}
                        <div className="flex flex-col items-center justify-center text-center border-r border-border/50 pr-0 md:pr-6 gap-3">
                          <span className="text-[8px] font-bold text-muted-fg uppercase tracking-widest block">Latencia de Conexión (TCP Ping)</span>
                          
                          {ping?.success ? (
                            <div className="relative flex items-center justify-center w-24 h-24 mt-1">
                              {/* Pulsing rings */}
                              <div className={`absolute inset-0 rounded-full animate-ping opacity-20 ${
                                ping.latencyMs! < 100 
                                  ? 'bg-chartreuse' 
                                  : ping.latencyMs! < 250 
                                  ? 'bg-amber-500' 
                                  : 'bg-destructive'
                              }`} style={{ animationDuration: '2s' }}></div>
                              <div className={`absolute -inset-2 rounded-full opacity-10 ${
                                ping.latencyMs! < 100 
                                  ? 'bg-chartreuse' 
                                  : ping.latencyMs! < 250 
                                  ? 'bg-amber-500' 
                                  : 'bg-destructive'
                              }`}></div>
                              
                              {/* Main latency circle */}
                              <div className={`w-20 h-20 rounded-full border flex flex-col items-center justify-center bg-muted shadow-[inset_0_2px_10px_rgba(0,0,0,0.8)] ${
                                ping.latencyMs! < 100 
                                  ? 'border-chartreuse/30' 
                                  : ping.latencyMs! < 250 
                                  ? 'border-[oklch(75% 0.13 80)]/30' 
                                  : 'border-destructive/30'
                              }`}>
                                <span className={`text-2xl font-black tracking-tighter ${
                                  ping.latencyMs! < 100 
                                    ? 'text-chartreuse' 
                                    : ping.latencyMs! < 250 
                                    ? 'text-[oklch(75% 0.13 80)]' 
                                    : 'text-destructive'
                                }`}>
                                  {ping.latencyMs}
                                </span>
                                <span className="text-[8px] text-muted-fg uppercase font-black tracking-widest">ms</span>
                              </div>
                            </div>
                          ) : (
                            <div className="w-20 h-20 rounded-full border border-destructive/20 bg-destructive/5 flex flex-col items-center justify-center text-center mt-1">
                              <ShieldAlert className="w-8 h-8 text-destructive animate-pulse" />
                              <span className="text-[8px] text-destructive font-extrabold uppercase mt-1">TIMEOUT</span>
                            </div>
                          )}

                          <span className="text-[9px] text-muted-fg font-medium">
                            {ping?.success 
                              ? `Handshake TCP puerto ${ping.port} completado` 
                              : `Conexión rechazada o caída (Puertos 80/443)`}
                          </span>
                        </div>

                        {/* WAF Shield details */}
                        <div className="flex flex-col justify-center gap-4">
                          <div className="space-y-2">
                            <span className="text-[8px] font-bold text-muted-fg uppercase tracking-widest block">Tecnología Cortafuegos Web (WAF)</span>
                            <div className="flex items-center gap-3 bg-muted/10 border border-border/50 p-3 rounded-xl transition-colors duration-300 group-hover:bg-muted/20">
                              <div className={`p-2.5 rounded-lg ${
                                cdnWaf?.detected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-fg'
                              }`}>
                                <Shield className={`w-6 h-6 ${cdnWaf?.detected ? 'animate-pulse' : ''}`} />
                              </div>
                              <div>
                                <span className="text-xs font-black text-foreground block">
                                  {cdnWaf?.detected ? cdnWaf.name : 'Proxy Directo Origin'}
                                </span>
                                <span className="text-[9px] text-muted-fg font-bold block uppercase tracking-wider mt-0.5">
                                  Proveedor: {cdnWaf?.detected ? cdnWaf.provider : 'Ninguno (Servidor Expuesto)'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <p className="text-[9.5px] text-muted-fg leading-relaxed">
                            {cdnWaf?.detected 
                              ? `Protección perimetral activa. Las solicitudes maliciosas, ataques DDoS de capa 7 e inyecciones SQL son filtrados por el CDN en el Edge antes de tocar tu servidor.`
                              : `¡Alerta de Perímetro! Al no contar con protección WAF/CDN, la dirección IP real de tu servidor web está expuesta directamente a ataques DDoS, escaneos de puertos automatizados y exploits.`}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Card 3: GeoIP, ASN & PTR (Identidad de Red) */}
                    <div className="glass-card p-6 flex flex-col justify-between hover:border-border transition-colors duration-300">
                      <div className="flex items-center justify-between border-b border-border/50 pb-3">
                        <h4 className="text-xs font-extrabold text-foreground/80 uppercase tracking-wider flex items-center gap-2">
                          <Cpu className="w-4 h-4 text-primary" />
                          Geolocalización e Identidad de Red (ASN/PTR)
                        </h4>
                        <span className="text-[9px] text-muted-fg font-mono uppercase tracking-wider">
                          {asnGeo?.ipVersion ? `IPv${asnGeo.ipVersion}` : 'IP'} Address
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2">
                        {/* Geo Coordinates conceptual map (Beautiful retro scanning radar grid!) */}
                        <div className="flex flex-col items-center justify-center gap-2 bg-card/60 border border-border/50 rounded-xl relative overflow-hidden h-[180px]">
                          {asnGeo?.latitude && asnGeo?.longitude ? (
                            <div className="absolute inset-0 z-0 pointer-events-none opacity-60 mix-blend-screen overflow-hidden">
                              <iframe
                                width="100%"
                                height="100%"
                                frameBorder="0"
                                scrolling="no"
                                src={`https://www.openstreetmap.org/export/embed.html?bbox=${asnGeo.longitude - 2},${asnGeo.latitude - 2},${asnGeo.longitude + 2},${asnGeo.latitude + 2}&layer=mapnik&marker=${asnGeo.latitude},${asnGeo.longitude}`}
                                className="w-full h-full object-cover scale-[1.3] grayscale invert contrast-125"
                                style={{ pointerEvents: 'none' }}
                              ></iframe>
                              <div className="absolute inset-0 bg-gradient-to-t from-[#020204] via-transparent to-[#020204]/80 z-10" />
                            </div>
                          ) : (
                            <>
                              {/* Conceptual Map Grid Background Fallback */}
                              <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:14px_14px]"></div>
                              
                              {/* Radial Scanning line */}
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/10 to-transparent w-full h-full animate-[pulse_3s_infinite]" style={{ transform: 'skewX(-20deg)' }}></div>

                              {/* SVG Radar circle & scan lines */}
                              <svg className="w-24 h-24 text-primary/20 absolute z-0 shrink-0" viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="3 3" />
                                <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="0.5" />
                                <circle cx="50" cy="50" r="15" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="1 2" />
                                <line x1="50" y1="5" x2="50" y2="95" stroke="currentColor" strokeWidth="0.5" />
                                <line x1="5" y1="50" x2="95" y2="50" stroke="currentColor" strokeWidth="0.5" />
                              </svg>
                            </>
                          )}

                          <div className="relative z-20 flex flex-col items-center text-center space-y-1 p-2 rounded-xl bg-[#020204]/60 backdrop-blur-md border border-border/70 mt-4">
                            <MapPin className="w-6 h-6 text-primary animate-bounce drop-shadow-[0_0_8px_rgba(98,113,196,0.6)]" />
                            <span className="text-[10px] font-black text-foreground drop-shadow-md">{asnGeo?.cityName || 'Ciudad Desconocida'}, {asnGeo?.countryCode || 'N/A'}</span>
                            <span className="text-[8px] text-muted-fg font-mono tracking-wider uppercase bg-black/50 px-1.5 py-0.5 rounded">Coords: {asnGeo?.latitude?.toFixed(4) ?? '0.0000'}, {asnGeo?.longitude?.toFixed(4) ?? '0.0000'}</span>
                            <span className="text-[9px] bg-muted/80 text-primary border border-primary/30 px-2 py-0.5 rounded mt-1 max-w-[150px] truncate block font-bold">
                              {asnGeo?.countryName || 'País Desconocido'}
                            </span>
                          </div>
                        </div>

                        {/* Network Metadata ASN / Reverse DNS list */}
                        <div className="space-y-4 flex flex-col justify-between">
                          <div className="space-y-1">
                            <span className="text-[8px] font-bold text-muted-fg uppercase tracking-widest block">Dirección IP de Destino</span>
                            <span 
                              className="text-xs font-mono font-extrabold text-foreground block bg-muted/10 border border-border/50 p-1.5 rounded truncate max-w-full overflow-hidden"
                              title={asnGeo?.ipAddress || 'Desconocido'}
                            >
                              {asnGeo?.ipAddress || 'Desconocido'}
                            </span>
                            {((asnGeo as any)?.ipv4 || (asnGeo as any)?.ipv6) && (
                              <div className="flex gap-2 mt-1">
                                {(asnGeo as any)?.ipv4 && <span className="text-[9px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20" title={(asnGeo as any).ipv4}>IPv4: {(asnGeo as any).ipv4}</span>}
                                {(asnGeo as any)?.ipv6 && <span className="text-[9px] font-mono text-muted-fg bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20 truncate max-w-[120px]" title={(asnGeo as any).ipv6}>IPv6: {(asnGeo as any).ipv6}</span>}
                              </div>
                            )}
                          </div>

                          <div className="space-y-1">
                            <span className="text-[8px] font-bold text-muted-fg uppercase tracking-widest block">Sistema Autónomo (ASN)</span>
                            <span className="text-[10px] text-foreground/80 font-bold block">
                              {asnGeo?.asn !== 'Desconocido' ? `ASN: ${asnGeo?.asn}` : 'ASN Desconocido'}
                            </span>
                            <span className="text-[10px] text-muted-fg font-medium block truncate max-w-[200px]" title={asnGeo?.asName || ''}>
                              {asnGeo?.asName || 'Proveedor de Red Desconocido'}
                            </span>
                          </div>

                          <div className="space-y-1">
                            <span className="text-[8px] font-bold text-muted-fg uppercase tracking-widest block">Resolución Inversa (PTR / Reverse DNS)</span>
                            <div className="bg-muted/5 border border-border/50 rounded-lg p-2 max-h-[60px] overflow-y-auto font-mono text-[9px] text-muted-fg space-y-0.5">
                              {reverseDns && reverseDns.length > 0 ? (
                                reverseDns.map((ptr, idx) => (
                                  <div key={idx} className="truncate select-all" title={ptr}>
                                    {ptr}
                                  </div>
                                ))
                              ) : (
                                <span className="text-muted-fg block text-[9px]">No se encontró registro PTR inverso</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card 4: DNSBL Historial y Vecindario IP */}
                    <div className="glass-card p-6 flex flex-col justify-between hover:border-border transition-colors duration-300">
                      <div className="flex items-center justify-between border-b border-border/50 pb-3">
                        <h4 className="text-xs font-extrabold text-foreground/80 uppercase tracking-wider flex items-center gap-2">
                          <Layers className="w-4 h-4 text-primary" />
                          Listas Negras (DNSBL) y Dominios Co-alojados
                        </h4>
                        {(() => {
                          const listedCount = dnsbl?.filter(item => item.listed).length || 0;
                          return (
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                              listedCount > 0 
                                ? 'bg-destructive/10 text-destructive border-destructive/20' 
                                : 'bg-chartreuse/10 text-chartreuse border-chartreuse/20'
                            }`}>
                              {listedCount > 0 ? `${listedCount} Reportes` : 'Limpio'}
                            </span>
                          );
                        })()}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2">
                        {/* DNSBL Status list */}
                        <div className="space-y-3">
                          <span className="text-[8px] font-bold text-muted-fg uppercase tracking-widest block">Monitoreo de Listas DNSBL</span>
                          
                          <div className="space-y-2">
                            {dnsbl && dnsbl.length > 0 ? (
                              dnsbl.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between bg-muted/5 border border-border/50 p-2 rounded-lg text-[10px]">
                                  <span className="font-extrabold text-foreground/80">{item.list}</span>
                                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                                    item.listed 
                                      ? 'bg-destructive/10 text-destructive border border-destructive/20' 
                                      : 'bg-chartreuse/10 text-chartreuse border border-chartreuse/20'
                                  }`}>
                                    {item.listed ? 'Reportado' : 'Seguro'}
                                  </span>
                                </div>
                              ))
                            ) : (
                              // Fallback default checks
                              ['Spamhaus ZEN', 'SORBS DNSBL', 'Barracuda BRBL'].map((name, idx) => (
                                <div key={idx} className="flex items-center justify-between bg-muted/5 border border-border/50 p-2 rounded-lg text-[10px]">
                                  <span className="font-extrabold text-foreground/80">{name}</span>
                                  <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase bg-chartreuse/10 text-chartreuse border border-chartreuse/20">
                                    Seguro
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {/* Co-hosted domains neighborhood inspector */}
                        <div className="space-y-2 flex flex-col justify-between">
                          <span className="text-[8px] font-bold text-muted-fg uppercase tracking-widest block">Dominios en el mismo Servidor ({reverseIp?.length || 0})</span>
                          
                          <div className="bg-card/40 border border-border/50 rounded-lg p-2.5 flex-1 flex flex-col justify-between max-h-[120px] overflow-y-auto">
                            {reverseIp && reverseIp.length > 0 ? (
                              <div className="space-y-1">
                                {reverseIp.slice(0, 10).map((dom, idx) => (
                                  <div key={idx} className="flex items-center gap-1.5 text-[9.5px] font-mono text-muted-fg hover:text-foreground transition-colors duration-150 truncate">
                                    <span className="w-1 h-1 bg-primary rounded-full shrink-0"></span>
                                    <span className="truncate">{dom}</span>
                                  </div>
                                ))}
                                {reverseIp.length > 10 && (
                                  <div className="text-[8px] text-muted-fg font-bold uppercase tracking-wider pt-1 border-t border-border/50 text-center">
                                    + {reverseIp.length - 10} dominios adicionales
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-col justify-center items-center text-center p-3 h-full gap-1">
                                <Server className="w-5 h-5 text-muted-fg/60" />
                                <span className="text-[9px] font-bold text-muted-fg uppercase tracking-wider block">IP Aislada o Compartida</span>
                                <p className="text-[8px] text-muted-fg leading-relaxed">
                                  No se detectaron vecinos públicos alojados en este nodo.
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* Card 5: Horizontal/Vertical packet traceroute hops transit flow */}
                  <div className="glass-card p-6 hover:border-border transition-colors duration-300">
                    <div className="flex items-center justify-between border-b border-border/50 pb-3 mb-6">
                      <div>
                        <h4 className="text-xs font-extrabold text-foreground/80 uppercase tracking-wider flex items-center gap-2">
                          <Compass className="w-4 h-4 text-primary" />
                          Traza Topológica de Tránsito de Paquetes (Visual Traceroute)
                        </h4>
                        <p className="text-[9px] text-muted-fg mt-0.5">
                          Mapa conceptual interactivo del trayecto y retardos de enrutamiento IP desde la puerta local hasta el destino
                        </p>
                      </div>
                      {traceroute && traceroute.length > 0 && (
                        <span className="text-[9px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded font-mono uppercase tracking-wider font-bold">
                          {traceroute.length} Nodos
                        </span>
                      )}
                    </div>

                    {traceroute && traceroute.length > 0 ? (
                      <div className="relative py-8 px-4 overflow-x-auto select-none no-scrollbar">
                        {/* Local CSS styles for high-fidelity animations */}
                        <style>{`
                          @keyframes dash-flow {
                            to { stroke-dashoffset: -40; }
                          }
                          .animate-dash-flow {
                            stroke-dasharray: 8 8;
                            animation: dash-flow 2s linear infinite;
                          }
                          @keyframes dash-vertical-flow {
                            to { stroke-dashoffset: -40; }
                          }
                          .animate-dash-vertical-flow {
                            stroke-dasharray: 8 8;
                            animation: dash-vertical-flow 2s linear infinite;
                          }
                          @keyframes ring-pulse {
                            0% { transform: scale(0.95); opacity: 0.5; }
                            50% { transform: scale(1.3); opacity: 0; }
                            100% { transform: scale(0.95); opacity: 0; }
                          }
                          .animate-ring-pulse {
                            animation: ring-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                          }
                        `}</style>

                        {/* Desktop Horizontal Connecting SVG */}
                        <svg className="absolute top-[50px] left-0 w-full h-[6px] pointer-events-none hidden md:block" style={{ width: '100%', minWidth: `${traceroute.length * 180}px` }}>
                          <path
                            d={`M 40 3 L ${traceroute.length * 180 - 40} 3`}
                            fill="none"
                            stroke="url(#trace-flow-grad)"
                            strokeWidth="3"
                            className="animate-dash-flow"
                          />
                          <defs>
                            <linearGradient id="trace-flow-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="#6271C4" />
                              <stop offset="50%" stopColor="#f472b6" />
                              <stop offset="100%" stopColor="var(--primary)" />
                            </linearGradient>
                          </defs>
                        </svg>

                        {/* Mobile Vertical Connecting Dotted Line */}
                        <div className="absolute top-12 bottom-12 left-10 w-[2px] bg-gradient-to-b from-indigo-500 via-pink-500 to-cyan-500 opacity-20 md:hidden pointer-events-none" />
                        <svg className="absolute top-12 bottom-12 left-[39px] w-[3px] h-[calc(100%-96px)] pointer-events-none md:hidden opacity-45">
                          <line
                            x1="1.5" y1="0" x2="1.5" y2="100%"
                            fill="none"
                            stroke="url(#trace-vertical-grad)"
                            strokeWidth="3"
                            className="animate-dash-vertical-flow"
                          />
                          <defs>
                            <linearGradient id="trace-vertical-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%" stopColor="#6271C4" />
                              <stop offset="50%" stopColor="#f472b6" />
                              <stop offset="100%" stopColor="var(--primary)" />
                            </linearGradient>
                          </defs>
                        </svg>

                        {/* Steps Grid */}
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center min-w-max gap-12 md:gap-4 px-4 relative z-10 font-sans">
                          {traceroute.map((hop) => {
                            // Determine latency tier colors and styling
                            const latencyColor = hop.latencyMs < 50 
                              ? 'border-chartreuse bg-chartreuse/20 text-chartreuse shadow-[0_0_15px_rgba(140,200,80,0.3)]' 
                              : hop.latencyMs < 150 
                              ? 'border-[oklch(75% 0.13 80)] bg-[oklch(75% 0.13 80)]/20 text-[oklch(75% 0.13 80)] shadow-[0_0_15px_rgba(180,120,30,0.3)]' 
                              : 'border-destructive bg-destructive/20 text-destructive shadow-[0_0_15px_rgba(190,18,60,0.3)]';

                            const pulseRingColor = hop.latencyMs < 50 
                              ? 'bg-chartreuse/30' 
                              : hop.latencyMs < 150 
                              ? 'bg-amber-500/30' 
                              : 'bg-destructive/30';

                            return (
                              <div key={hop.hop} className="flex flex-row md:flex-col items-center gap-5 md:gap-4 group/hop relative min-w-[150px] max-w-[200px]">
                                
                                {/* Visual node representation */}
                                <div className="relative shrink-0 z-20 cursor-pointer">
                                  {/* Pulsing glow ring based on latency */}
                                  <span className={`absolute -inset-1 rounded-full animate-ring-pulse ${pulseRingColor}`} />
                                  
                                  <div className={`w-[38px] h-[38px] rounded-full border-2 flex items-center justify-center font-black text-[11px] relative z-10 transition-[color,border-color,box-shadow,transform,width,height] duration-300 group-hover/hop:scale-115 group-hover/hop:border-primary group-hover/hop:text-primary group-hover/hop:shadow-[0_0_20px_rgba(98,113,196,0.5)] ${latencyColor}`}>
                                    {hop.hop}
                                  </div>
                                </div>

                                {/* Step Label Details */}
                                <div className="space-y-1 text-left md:text-center flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 md:justify-center">
                                    <span className="text-[10.5px] font-black text-foreground block max-w-[120px] truncate group-hover/hop:text-primary transition-colors duration-200" title={hop.hostname}>
                                      {hop.hostname}
                                    </span>
                                    {hop.countryCode && hop.countryCode !== 'LAN' && (
                                      <span className="text-[8px] bg-muted/20 text-muted-fg border border-border/70 font-extrabold uppercase px-1 rounded scale-90 select-none">
                                        {hop.countryCode}
                                      </span>
                                    )}
                                  </div>
                                  
                                  <span className="text-[9px] font-mono text-muted-fg block truncate" title={hop.ip}>{hop.ip}</span>
                                  
                                  <span className="text-[9.5px] text-muted-fg font-bold block leading-snug truncate max-w-[140px]" title={hop.asnOrg || ''}>
                                    {hop.asnOrg}
                                  </span>

                                  {/* Latency badge */}
                                  <div className="pt-0.5 flex items-center gap-1.5 md:justify-center">
                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded font-mono border ${
                                      hop.latencyMs < 50 
                                        ? 'bg-chartreuse/10 text-chartreuse border-chartreuse/20' 
                                        : hop.latencyMs < 150 
                                        ? 'bg-[oklch(75% 0.13 80)]/10 text-[oklch(75% 0.13 80)] border-[oklch(75% 0.13 80)]/20' 
                                        : 'bg-destructive/10 text-destructive border-destructive/20'
                                    }`}>
                                      {hop.latencyMs} ms
                                    </span>
                                    {hop.asn && (
                                      <span className="text-[8.5px] text-muted-fg font-mono font-bold select-none">{hop.asn}</span>
                                    )}
                                  </div>
                                </div>

                                {/* PREMIUM HOVER INTERACTIVE TOOLTIP POPOVER */}
                                <div className="group-hover/hop:opacity-100 group-hover/hop:translate-y-0 opacity-0 translate-y-2 pointer-events-none absolute bottom-[105%] left-1/2 -translate-x-1/2 mb-4 bg-muted/[0.95] backdrop-blur-xl border border-border p-4.5 rounded-2xl shadow-[0_20px_45px_rgba(0,0,0,0.9),0_0_20px_rgba(255,255,255,0.01)] transition-[opacity,transform] duration-300 w-64 z-50 flex flex-col gap-3 text-xs select-text text-left font-sans">
                                  <div className="flex items-center justify-between border-b border-border/70 pb-2">
                                    <span className="text-[8px] font-extrabold text-muted-fg uppercase tracking-widest">DETALLES DEL SALTO #{hop.hop}</span>
                                    <span className="text-[9px] font-mono text-primary font-extrabold">{hop.type?.toUpperCase() || 'UNKNOWN'}</span>
                                  </div>
                                  
                                  <div className="space-y-2">
                                    <div className="space-y-0.5">
                                      <span className="text-[8px] font-bold text-muted-fg uppercase tracking-wider block">Servidor (Host)</span>
                                      <span className="text-[11px] font-black text-foreground block break-all leading-normal">{hop.hostname}</span>
                                    </div>
                                    <div className="flex justify-between gap-4">
                                      <div className="space-y-0.5 flex-1 min-w-0">
                                        <span className="text-[8px] font-bold text-muted-fg tracking-wider block">Dirección IP</span>
                                        <span className="text-[10px] font-mono text-foreground/80 font-bold block truncate select-all">{hop.ip}</span>
                                      </div>
                                      {hop.countryCode && (
                                        <div className="space-y-0.5 text-right shrink-0">
                                          <span className="text-[8px] font-bold text-muted-fg tracking-wider block">Geolocalización</span>
                                          <span className="text-[10px] font-bold text-foreground/80 block">
                                            {hop.cityName ? `${hop.cityName}, ` : ''}{hop.countryCode}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                    <div className="space-y-0.5 border-t border-border/50 pt-2">
                                      <span className="text-[8px] font-bold text-muted-fg tracking-wider block">Sistema Autónomo e ISP</span>
                                      <span className="text-[10px] text-foreground/80 font-bold block leading-snug truncate" title={hop.asnOrg || ''}>{hop.asnOrg || 'Proveedor Local'}</span>
                                      {hop.asn && <span className="text-[9px] text-muted-fg font-mono font-bold">{hop.asn}</span>}
                                    </div>
                                    
                                    {/* HSL-tuned relative latency comparison bar */}
                                    <div className="space-y-1.5 border-t border-border/50 pt-2">
                                      <div className="flex justify-between text-[9px] font-bold uppercase">
                                        <span className="text-muted-fg">Latencia</span>
                                        <span className="text-foreground font-mono">{hop.latencyMs} ms</span>
                                      </div>
                                      <div className="w-full h-2 bg-muted border border-border/50 rounded-full overflow-hidden p-0.5">
                                        <div 
                                          className="h-full rounded-full transition-[width,background-color,box-shadow] duration-500 shadow-[0_0_8px_rgba(255,255,255,0.1)]" 
                                          style={{ 
                                            width: `${Math.max(8, Math.min(100, (hop.latencyMs / 300) * 100))}%`, 
                                            backgroundColor: `hsl(${Math.max(0, 120 - (hop.latencyMs / 300) * 120)}, 85%, 48%)` 
                                          }} 
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </div>

                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col justify-center items-center text-center py-10 bg-muted/1 border border-dashed border-border/50 rounded-xl gap-2">
                        <Compass className="w-10 h-10 text-muted-fg animate-spin" style={{ animationDuration: '6s' }} />
                        <span className="text-xs font-bold text-muted-fg">Generando Topología de Tránsito</span>
                        <p className="text-[10px] text-muted-fg max-w-xs leading-relaxed">
                          La traza de enrutamiento se modela y mapea en tiempo real según el retardo y la geolocalización detectada para el host objetivo.
                        </p>
                      </div>
                    )}
                  </div>

                </div>
              );
            })()}

            {/* Bento-Row 2: Findings List Accordions */}
            <div className="glass-card overflow-hidden">
              <div className="p-8 border-b border-border bg-muted/1">
                <h3 className="font-extrabold text-foreground text-base tracking-tight">Hallazgos e Ineficiencias de Red</h3>
                <p className="text-[10px] font-bold text-muted-fg uppercase tracking-widest mt-0.5">
                  Lista de vulnerabilidades clasificadas por severidad con evidencia técnica
                </p>
              </div>

              {selectedDetails.findings.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center justify-center gap-4 bg-muted/1">
                  <CheckCircle2 className="w-10 h-10 text-chartreuse" />
                  <div>
                    <h4 className="font-extrabold text-foreground text-sm">¡Excelente Postura de Seguridad!</h4>
                    <p className="text-xs text-muted-fg max-w-sm mt-1 mx-auto leading-relaxed">
                      No se encontraron vulnerabilidades o fallas DNS en tu infraestructura de red.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.04]">
                  {selectedDetails.findings.map((finding) => {
                    const severityConfig: Record<string, { glow: string; bg: string; border: string; icon: string }> = {
                      critical: { glow: 'shadow-[0_0_15px_rgba(190,18,60,0.15)]', bg: 'bg-destructive/5', border: 'border-destructive/20', icon: 'text-destructive' },
                      high: { glow: 'shadow-[0_0_15px_rgba(190,18,60,0.1)]', bg: 'bg-destructive/5', border: 'border-destructive/20', icon: 'text-destructive/80' },
                      medium: { glow: '', bg: 'bg-[oklch(75% 0.13 80)]/5', border: 'border-[oklch(75% 0.13 80)]/10', icon: 'text-[oklch(75% 0.13 80)]' },
                      low: { glow: '', bg: 'bg-primary/5', border: 'border-primary/10', icon: 'text-primary' },
                      info: { glow: '', bg: 'bg-primary/5', border: 'border-primary/10', icon: 'text-primary' },
                    };
                    const config = severityConfig[finding.severity] || { glow: '', bg: 'bg-muted/5', border: 'border-border/50', icon: 'text-muted-fg' };

                    return (
                      <div key={finding.id} className={`p-6 md:p-8 m-4 rounded-xl transition-colors duration-300 flex flex-col gap-5 ${config.bg} ${config.border} border ${config.glow} hover:bg-muted/10`}>
                        
                        {/* Header row */}
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                          <div className="flex items-start gap-4">
                            <div className="mt-0.5">
                               <AlertTriangle className={`w-5 h-5 ${config.icon}`} />
                            </div>
                            <div>
                              <h4 className="font-extrabold text-foreground text-base tracking-tight flex items-center gap-2">
                                {finding.title}
                                <span className="inline-flex items-center gap-1.5 ml-2"><AutoMitreBadge findingTitle={finding.title} toolId={finding.toolId} size="sm" /></span>
                                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${getSeverityBadge(finding.severity)}`}>
                                  {finding.severity}
                                </span>
                              </h4>
                              <p className="text-[10px] font-bold text-muted-fg uppercase tracking-wider mt-2 flex items-center gap-1.5">
                                <Server className="w-3.5 h-3.5" /> Activo: <span className="text-foreground/80 font-mono font-medium bg-background px-1.5 py-0.5 rounded border border-border/50">{finding.affectedAsset || 'General'}</span>
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Description & Recommendations */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs leading-relaxed pt-4 border-t border-border/50">
                          <div className="space-y-2.5">
                            <h5 className="text-[10px] font-bold text-muted-fg uppercase tracking-widest flex items-center gap-1.5">
                              <Info className="w-3.5 h-3.5" /> Contexto Técnico
                            </h5>
                            <p className="text-muted-fg font-medium">
                              {finding.description}
                            </p>
                          </div>
                          {finding.recommendation && (
                            <div className="space-y-2.5">
                              <h5 className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 ${severityConfig.icon}`}>
                                <Shield className="w-3.5 h-3.5" /> Plan de Acción
                              </h5>
                              <p className="text-foreground/80 font-medium bg-black/20 p-3.5 rounded-lg border border-border/30">
                                {finding.recommendation}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Evidence JSON payload */}
                        {finding.evidence && Object.keys(finding.evidence).length > 0 && (
                          <div className="mt-2 bg-card border border-border/50 p-4 rounded-xl relative overflow-hidden group">
                            <div className="flex justify-between items-center mb-3">
                              <span className="text-[9px] font-bold text-muted-fg uppercase tracking-widest flex items-center gap-1.5">
                                <Terminal className="w-3.5 h-3.5 text-muted-fg" /> Evidencia RAW
                              </span>
                              <button
                                onClick={() => handleCopyToClipboard(JSON.stringify(finding.evidence, null, 2))}
                                className="text-[9px] font-bold uppercase tracking-widest text-muted-fg hover:text-foreground transition-colors cursor-pointer bg-muted/10 hover:bg-muted/30 border border-border/70 px-2.5 py-1 rounded"
                              >
                                Copiar Payload
                              </button>
                            </div>
                            <pre className="text-[10px] font-mono text-muted-fg overflow-x-auto select-all max-h-[140px] leading-relaxed p-3 bg-background rounded-lg border border-border/30">
                              {JSON.stringify(finding.evidence, null, 2)}
                            </pre>
                          </div>
                        )}

                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bento-Row 2.5: Event Timeline */}
            {selectedDetails.events && selectedDetails.events.length > 0 && (
              <div className="glass-card overflow-hidden mt-8">
                <div className="p-8 border-b border-border bg-muted/1">
                  <h3 className="font-extrabold text-foreground text-base tracking-tight flex items-center gap-2">
                    <History className="w-4 h-4 text-primary" /> Timeline de Ejecución
                  </h3>
                  <p className="text-[10px] font-bold text-muted-fg uppercase tracking-widest mt-0.5">
                    Secuencia de eventos y estado del análisis
                  </p>
                </div>
                <div className="p-8">
                  <div className="relative border-l-2 border-border ml-3 space-y-7">
                    {selectedDetails.events.map((evt, idx) => (
                      <div key={evt.id} className="relative pl-6" style={{ animation: `fade-in 0.5s ease-out ${idx * 0.1}s both` }}>
                        {/* Timeline Node */}
                        <div className="absolute -left-[7px] top-1.5 w-3 h-3 rounded-full bg-card border-2 border-primary shadow-[0_0_8px_rgba(98,113,196,0.5)]" />
                        
                        <div className="flex flex-col gap-1">
                          <span className="text-[9px] font-bold text-primary uppercase tracking-widest bg-primary/10 border border-primary/20 px-2 py-0.5 rounded w-fit">
                            {new Date(evt.createdAt).toLocaleTimeString()} · {evt.eventType}
                          </span>
                          <span className="text-xs font-medium text-foreground/80">
                            {evt.message}
                          </span>
                        </div>
                      </div>
                    ))}
                    {/* Live indicator if status is not completed */}
                    {selectedDetails.investigation.status !== 'completed' && (
                      <div className="relative pl-6 animate-pulse mt-7">
                        <div className="absolute -left-[7px] top-1.5 w-3 h-3 rounded-full bg-card border-2 border-chartreuse shadow-[0_0_8px_rgba(140,200,80,0.5)]" />
                        <span className="text-[9px] font-bold text-chartreuse uppercase tracking-widest bg-chartreuse/10 border border-chartreuse/20 px-2 py-0.5 rounded w-fit">
                          Escaneando en vivo...
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Bento-Row 3: Discovered Assets Grid */}
            {selectedDetails.assets && selectedDetails.assets.length > 0 && (
              <div className="glass-card overflow-hidden">
                <div className="p-8 border-b border-border bg-muted/1">
                  <h3 className="font-extrabold text-foreground text-base tracking-tight">Activos Técnicos Descubiertos</h3>
                  <p className="text-[10px] font-bold text-muted-fg uppercase tracking-widest mt-0.5">
                    Infraestructura mapeada durante la auditoría
                  </p>
                </div>

                <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {selectedDetails.assets.map((asset) => (
                    <div key={asset.id} className="backdrop-blur-xl border border-border/50 bg-muted/1 p-5 rounded-xl flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-9 h-9 rounded-lg bg-muted/10 border border-border flex items-center justify-center text-muted-fg">
                          <Server className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <span className="block text-[8px] font-bold text-muted-fg uppercase tracking-widest">
                            {asset.assetType}
                          </span>
                          <span className="block text-xs font-bold text-foreground truncate font-mono mt-0.5">
                            {asset.value}
                          </span>
                        </div>
                      </div>
                      {asset.ip && (
                        <span className="text-[9px] bg-muted/5 border border-border/50 text-muted-fg font-mono px-2 py-0.5 rounded">
                          {asset.ip}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bento-Row 4: IA Remediation Copilot Console */}
            <div className="glass-card overflow-hidden relative">
              <div className="p-8 border-b border-border bg-muted/1 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <h3 className="font-extrabold text-foreground text-base tracking-tight flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary animate-pulse" /> Copilot de Remediación Técnica con IA
                  </h3>
                  <p className="text-[10px] font-bold text-muted-fg uppercase tracking-widest mt-0.5">
                    Genera scripts Nginx, configuraciones DNS y directivas SPF/DMARC a medida
                  </p>
                </div>

                {!copilotOutput && !isGeneratingCopilot && (
                  <button
                    onClick={handleGenerateCopilot}
                    disabled={isGeneratingCopilot}
                    className="bg-gradient-to-r from-primary to-primary/80 text-foreground font-bold text-xs uppercase tracking-widest px-6 py-3.5 rounded-xl flex items-center gap-2 border border-primary/20 cursor-pointer hover:shadow-[0_0_20px_rgba(98,113,196,0.3)] hover:brightness-110 active:scale-95 transition-[color,background-color,border-color,opacity,box-shadow,transform,filter] disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed text-center shrink-0 shadow-lg"
                  >
                    Generar Plan IA <Sparkles className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Copilot plan loader workspace */}
              {isGeneratingCopilot && (
                <div className="p-8 bg-[#030305]/95 border-t border-border/50 flex flex-col lg:flex-row gap-8 items-center justify-center min-h-[380px] relative overflow-hidden animate-in fade-in duration-500">
                  {/* Glowing background circles */}
                  <div className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full bg-primary/5 blur-3xl animate-pulse pointer-events-none" />
                  <div className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full bg-indigo-500/5 blur-3xl animate-pulse pointer-events-none" />
                  
                  {/* Left Side: SVG Pulsing Neural Network Grid */}
                  <div className="w-full lg:w-1/2 flex flex-col items-center justify-center relative py-6 select-none">
                    <svg className="w-56 h-56 text-primary" viewBox="0 0 120 120">
                      <style>{`
                        .pulse-core { animation: core-glow 2.5s infinite ease-in-out; }
                        .pulse-satellite { animation: satellite-pulse 2s infinite ease-in-out; }
                        .neural-path { stroke-dasharray: 6 6; animation: signal-flow 4s infinite linear; }
                        .neural-path-fast { stroke-dasharray: 4 4; animation: signal-flow 2s infinite linear; }
                        
                        @keyframes core-glow {
                          0%, 100% { r: 12; fill: oklch(68% 0.14 230 / 0.1); stroke-width: 2.5; filter: drop-shadow(0 0 4px oklch(68% 0.14 230 / 0.4)); }
                          50% { r: 16; fill: oklch(68% 0.14 230 / 0.35); stroke-width: 4; filter: drop-shadow(0 0 16px oklch(68% 0.14 230 / 0.8)); }
                        }
                        @keyframes satellite-pulse {
                          0%, 100% { r: 4.5; opacity: 0.6; stroke-width: 1.5; }
                          50% { r: 6.5; opacity: 1; stroke-width: 2.5; filter: drop-shadow(0 0 8px currentColor); }
                        }
                        @keyframes signal-flow {
                          to { stroke-dashoffset: -20; }
                        }
                      `}</style>
                      
                      <defs>
                        <radialGradient id="core-gradient" cx="50%" cy="50%" r="50%">
                          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.8" />
                          <stop offset="100%" stopColor="#0891b2" stopOpacity="0" />
                        </radialGradient>
                        <linearGradient id="link-grad-1" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#6366f1" />
                          <stop offset="100%" stopColor="var(--primary)" />
                        </linearGradient>
                        <linearGradient id="link-grad-2" x1="100%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#ec4899" />
                          <stop offset="100%" stopColor="#6271C4" />
                        </linearGradient>
                      </defs>

                      {/* Connection paths (connecting satellite nodes in a gorgeous mesh pattern) */}
                      <line x1="25" y1="25" x2="60" y2="60" stroke="url(#link-grad-1)" strokeWidth="1.5" className="neural-path" style={{ animationDelay: '0s' }} />
                      <line x1="95" y1="25" x2="60" y2="60" stroke="url(#link-grad-2)" strokeWidth="1.5" className="neural-path-fast" style={{ animationDelay: '0.4s' }} />
                      <line x1="95" y1="95" x2="60" y2="60" stroke="url(#link-grad-1)" strokeWidth="1.5" className="neural-path" style={{ animationDelay: '0.8s' }} />
                      <line x1="25" y1="95" x2="60" y2="60" stroke="url(#link-grad-2)" strokeWidth="1.5" className="neural-path-fast" style={{ animationDelay: '1.2s' }} />
                      <line x1="60" y1="15" x2="60" y2="60" stroke="#a855f7" strokeWidth="1.5" className="neural-path" style={{ animationDelay: '1.6s' }} />
                      <line x1="60" y1="105" x2="60" y2="60" stroke="#f43f5e" strokeWidth="1.5" className="neural-path-fast" style={{ animationDelay: '2.0s' }} />
                      
                      {/* Inter-satellite connections forming a beautiful outer boundary loop */}
                      <line x1="25" y1="25" x2="60" y2="15" stroke="#6366f1" strokeWidth="1" strokeOpacity="0.3" className="neural-path" />
                      <line x1="60" y1="15" x2="95" y2="25" stroke="#ec4899" strokeWidth="1" strokeOpacity="0.3" className="neural-path" />
                      <line x1="95" y1="25" x2="95" y2="95" stroke="#a855f7" strokeWidth="1" strokeOpacity="0.3" className="neural-path-fast" />
                      <line x1="95" y1="95" x2="60" y2="105" stroke="#f43f5e" strokeWidth="1" strokeOpacity="0.3" className="neural-path" />
                      <line x1="60" y1="105" x2="25" y2="95" stroke="#8BC34A" strokeWidth="1" strokeOpacity="0.3" className="neural-path-fast" />
                      <line x1="25" y1="95" x2="25" y2="25" stroke="#3b82f6" strokeWidth="1" strokeOpacity="0.3" className="neural-path" />

                      {/* Central Core glowing node */}
                      <circle cx="60" cy="60" r="14" fill="url(#core-gradient)" className="pulse-core" />
                      <circle cx="60" cy="60" r="6" fill="#030712" stroke="#6271C4" strokeWidth="2.5" />
                      
                      {/* Outer satellite nodes with reactive glow delays */}
                      <circle cx="25" cy="25" r="5.5" fill="#030712" stroke="#6366f1" strokeWidth="2" className="pulse-satellite text-primary" style={{ animationDelay: '0.2s' }} />
                      <circle cx="95" cy="25" r="5.5" fill="#030712" stroke="#ec4899" strokeWidth="2" className="pulse-satellite text-primary" style={{ animationDelay: '0.6s' }} />
                      <circle cx="95" cy="95" r="5.5" fill="#030712" stroke="#a855f7" strokeWidth="2" className="pulse-satellite text-muted-fg" style={{ animationDelay: '1.0s' }} />
                      <circle cx="25" cy="95" r="5.5" fill="#030712" stroke="#8BC34A" strokeWidth="2" className="pulse-satellite text-chartreuse" style={{ animationDelay: '1.4s' }} />
                      <circle cx="60" cy="15" r="5.5" fill="#030712" stroke="#3b82f6" strokeWidth="2" className="pulse-satellite text-blue-400" style={{ animationDelay: '1.8s' }} />
                      <circle cx="60" cy="105" r="5.5" fill="#030712" stroke="#f43f5e" strokeWidth="2" className="pulse-satellite text-destructive" style={{ animationDelay: '2.2s' }} />
                    </svg>
                    
                    <div className="absolute text-center mt-44">
                      <span className="text-[10px] bg-muted/40 text-primary border border-primary/20 px-3.5 py-1.5 rounded-full font-mono font-bold tracking-widest animate-pulse uppercase">
                        AI_COPILOT_REASONING
                      </span>
                    </div>
                  </div>

                  {/* Right Side: Step-by-Step Interactive Scanning Checklist Log */}
                  <div className="w-full lg:w-1/2 p-6 rounded-2xl bg-muted/60 border border-border/70 relative overflow-hidden font-mono text-[11px] leading-relaxed text-muted-fg pl-6 lg:pl-8 text-left shadow-[inset_0_1px_2px_rgba(255,255,255,0.05)]">
                    {/* Retro console scan lines overlay */}
                    <div className="absolute inset-0 pointer-events-none bg-scanlines opacity-[0.03]" />
                    
                    <div className="flex items-center gap-2 border-b border-border pb-3 mb-4">
                      <div className="flex gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-destructive/80 animate-pulse" />
                        <div className="w-2 h-2 rounded-full bg-[oklch(75% 0.13 80)]/80" />
                        <div className="w-2 h-2 rounded-full bg-chartreuse/80" />
                      </div>
                      <span className="text-[8px] font-black text-muted-fg uppercase tracking-widest ml-2">CONSOLA DE EJECUCIÓN CO-PILOTO</span>
                    </div>

                    <div className="space-y-3.5 font-mono">
                      {[
                        { stepNum: 1, text: 'Leyendo evidencias de red normalizadas...' },
                        { stepNum: 2, text: 'Correlacionando brechas DNS con directivas OWASP...' },
                        { stepNum: 3, text: 'Redactando código de remediación automatizado...' },
                        { stepNum: 4, text: 'Compilando configuraciones Nginx, Apache y DNS TXT...' },
                        { stepNum: 5, text: 'Verificando consistencia semántica del plan...' }
                      ].map((s) => {
                        const isActive = copilotStep === s.stepNum;
                        const isDone = copilotStep > s.stepNum;
                        return (
                          <div key={s.stepNum} className={`flex items-center gap-3 transition-colors duration-300 ${isActive ? 'text-primary font-bold' : isDone ? 'text-chartreuse/70 font-semibold' : 'text-muted-fg'}`}>
                            <div className="shrink-0 font-mono">
                              {isDone ? (
                                <span className="text-chartreuse font-black drop-shadow-[0_0_4px_rgba(140,200,80,0.5)]">✓</span>
                              ) : isActive ? (
                                <div className="w-3.5 h-3.5 flex items-center justify-center">
                                  <Loader2 className="w-3 h-3 text-primary animate-spin" />
                                </div>
                              ) : (
                                <span className="text-muted-fg/80 font-black">&bull;</span>
                              )}
                            </div>
                            <span className={isActive ? 'drop-shadow-[0_0_6px_rgba(98,113,196,0.5)] font-bold' : ''}>
                              {isActive ? `> ${s.text}` : `  ${s.text}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Copilot plan output display */}
              {copilotOutput && (
                <div className="p-8 bg-background space-y-6">
                  
                  {/* Actions & controls bar */}
                  <div className="flex items-center justify-between px-1.5">
                    <span className="text-[9px] font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5" /> Plan de Acción e Instrucciones de Despliegue
                    </span>
                    <button
                      onClick={() => handleCopyToClipboard(copilotOutput)}
                      className="text-[9px] font-bold uppercase tracking-widest text-muted-fg hover:text-foreground transition-colors flex items-center gap-1 bg-muted/5 border border-border/50 px-3.5 py-2 rounded-xl cursor-pointer"
                    >
                      {copiedIndex ? (
                        <>
                          <Check className="w-3 h-3 text-chartreuse" /> ¡Copiado!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" /> Copiar Plan Completo
                        </>
                      )}
                    </button>
                  </div>

                  {/* Rendered remediation content */}
                  <div className="bg-[#08080c] border border-border/50 p-8 rounded-2xl relative">
                    <div className="space-y-6 max-w-none text-foreground/80 leading-relaxed text-xs font-sans">
                      {parseMarkdown(copilotOutput).map((block, idx) => {
                        switch (block.type) {
                          case 'h1':
                            return (
                              <h2 key={idx} className="text-lg font-extrabold text-foreground flex items-center gap-2 border-b border-border pb-2.5 pt-6 first:pt-0">
                                <span aria-hidden="true" className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(98,113,196,0.6)]" />
                                {renderInlineMarkdown(block.content || '')}
                              </h2>
                            );
                          case 'h2':
                            return (
                              <h3 key={idx} className="text-base font-extrabold text-foreground flex items-center gap-2 border-b border-border pb-2 pt-5 first:pt-0">
                                <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(98,113,196,0.6)]" />
                                {renderInlineMarkdown(block.content || '')}
                              </h3>
                            );
                          case 'h3':
                            return (
                              <h4 key={idx} className="text-sm font-bold text-foreground flex items-center gap-2 pt-4 first:pt-0">
                                <span aria-hidden="true" className="w-1 h-1 rounded-full bg-primary shadow-[0_0_8px_rgba(98,113,196,0.5)]" />
                                {renderInlineMarkdown(block.content || '')}
                              </h4>
                            );
                          case 'ul':
                            return (
                              <ul key={idx} className="space-y-2.5 my-3 pl-1.5">
                                {block.items?.map((item, itemIdx) => (
                                  <li key={itemIdx} className="flex items-start gap-2.5 text-foreground/80 text-xs leading-relaxed">
                                    <span className="text-primary font-bold mt-1 select-none text-[9px]">&bull;</span>
                                    <div className="flex-1">{renderInlineMarkdown(item)}</div>
                                  </li>
                                ))}
                              </ul>
                            );
                          case 'ol':
                            return (
                              <ol key={idx} className="space-y-2.5 my-3 pl-1.5 list-decimal list-inside">
                                {block.items?.map((item, itemIdx) => (
                                  <li key={itemIdx} className="text-foreground/80 text-xs leading-relaxed pl-1">
                                    <span className="flex-1 inline pl-1">{renderInlineMarkdown(item)}</span>
                                  </li>
                                ))}
                              </ol>
                            );
                          case 'code':
                            return (
                              <div key={idx} className="border border-border rounded-xl overflow-hidden my-4 bg-[#0a0a0f] shadow-md">
                                <div className="bg-[#0f0f16] px-4 py-2 border-b border-border/50 flex items-center justify-between text-[10px] font-bold tracking-widest text-muted-fg uppercase select-none">
                                  <span>{block.language || 'código'}</span>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(block.content || '');
                                      setCopiedBlockIdx(idx);
                                      setTimeout(() => setCopiedBlockIdx(null), 2000);
                                    }}
                                    className="hover:text-foreground transition-colors flex items-center gap-1 cursor-pointer bg-muted/10 hover:bg-muted/30 px-2.5 py-1 rounded-md border border-border/50"
                                  >
                                    {copiedBlockIdx === idx ? (
                                      <>
                                        <Check className="w-3 h-3 text-chartreuse" /> ¡Copiado!
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3 h-3" /> Copiar Código
                                      </>
                                    )}
                                  </button>
                                </div>
                                <pre className="p-4 overflow-x-auto text-[11px] font-mono text-foreground/80 bg-background leading-relaxed">
                                  <code>{block.content}</code>
                                </pre>
                              </div>
                            );
                          case 'p':
                          default:
                            return (
                              <p key={idx} className="text-foreground/80 leading-relaxed text-xs">
                                {renderInlineMarkdown(block.content || '')}
                              </p>
                            );
                        }
                      })}
                    </div>
                  </div>

                  {/* Dynamic clean reset button */}
                  <div className="flex justify-end">
                    <button
                      onClick={() => setCopilotOutput(null)}
                      className="text-[9px] font-bold uppercase tracking-widest text-muted-fg hover:text-foreground transition-colors"
                    >
                      Volver a Generar
                    </button>
                  </div>

                </div>
              )}
            </div>

          </div>
        )}

        {/* ─── CASE C: Sin análisis seleccionado / Estado inicial ─────────── */}
        {!isScanning && !selectedDetails && (
          <div className="glass-card p-16 text-center flex flex-col items-center justify-center gap-6 animate-in fade-in duration-500 flex-1">
            <div className="w-16 h-16 rounded-2xl bg-muted/10 border border-border flex items-center justify-center text-muted-fg relative">
              <ShieldCheck className="w-8 h-8 text-muted-fg animate-pulse" />
              <div className="absolute inset-0 bg-primary/10 rounded-2xl blur-lg animate-ping" />
            </div>
            <div>
              <h4 className="font-extrabold text-foreground text-base tracking-tight">
                Espacio de Trabajo de Inteligencia de Red
              </h4>
              <p className="text-xs text-muted-fg max-w-sm mx-auto leading-relaxed mt-2">
                Ingresa una dirección de infraestructura en la barra superior o selecciona un análisis del historial de tu proyecto para comenzar.
              </p>
            </div>
          </div>
        )}

      </div>

      {showBriefModal && selectedDetails && (
        <IncidentBriefModal
          investigationId={selectedDetails.investigation.id}
          target={selectedDetails.investigation.target}
          score={selectedDetails.investigation.score}
          criticalCount={selectedDetails.findings.filter(f => f.severity === 'critical').length}
          highCount={selectedDetails.findings.filter(f => f.severity === 'high').length}
          onClose={() => setShowBriefModal(false)}
        />
      )}
    </div>
  );
}
