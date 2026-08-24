'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShieldCheck, AlertCircle, Terminal, ArrowRight, Loader2, Server, History, CheckCircle2,
  Info, Globe, AlertTriangle,
  Shield, Activity, MapPin, BookMarked,
  FileText, TrendingDown, Network
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ScoreGauge } from '@/features/dashboard/ScoreGauge';
import { AttackSurfaceGraph } from '@/features/dashboard/AttackSurfaceGraph';
import { IncidentBriefModal } from '@/features/dashboard/IncidentBriefModal';
import { AutoMitreBadge } from '@/features/dashboard/MitreBadge';
import { GeoMap } from '@/features/dashboard/GeoMap';
import { DownloadPdfButton } from '@/features/dashboard/DownloadPdfButton';
import { HistoryPanel } from '@/features/dashboard/HistoryPanel';
import { getScoreRating, getSeverityBadge } from '@/features/intelligence/lib/rendering/severity';
import { getErrorMessage } from '@/shared/lib/errors';

import type { Project, Investigation, Finding, RunEvent, Asset } from './intelligence/types';
import { NetworkOsintSection } from './intelligence/NetworkOsintSection';
import { MailSecurityPanel } from './intelligence/MailSecurityPanel';
import { CopilotConsole } from './intelligence/CopilotConsole';

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
                  metadata={selectedDetails.investigation.metadata}
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
                  metadata={selectedDetails.investigation.metadata}
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
            <MailSecurityPanel
              metadata={selectedDetails?.investigation?.metadata ?? null}
              target={selectedDetails.investigation.target}
              findings={selectedDetails.findings}
              expandedAccordions={expandedAccordions}
              onToggleAccordion={toggleAccordion}
              copiedId={copiedId}
              onCopy={handleCopyToClipboard}
            />

            {/* Bento-Row 1.8: Red y OSINT (Network & OSINT) */}
            <NetworkOsintSection metadata={selectedDetails?.investigation?.metadata ?? null} />

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
            <CopilotConsole
              output={copilotOutput}
              isGenerating={isGeneratingCopilot}
              step={copilotStep}
              planCopied={copiedIndex}
              onGenerate={handleGenerateCopilot}
              onCopyPlan={() => handleCopyToClipboard(copilotOutput ?? '')}
              onReset={() => setCopilotOutput(null)}
            />

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
