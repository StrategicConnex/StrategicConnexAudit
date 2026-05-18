'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  ShieldCheck, AlertCircle, Terminal, ArrowRight, Loader2, 
  ShieldAlert, Server, History, Sparkles, CheckCircle2, 
  Lock, Unlock, Key, Cpu, Copy, Check, Info, Globe, AlertTriangle,
  Mail, Shield, X, Activity, MapPin, Wifi, Clock, Layers, Compass
} from 'lucide-react';

interface Project {
  id: string;
  name: string;
  domain: string;
}

interface Investigation {
  id: string;
  projectId: string;
  title: string;
  target: string;
  targetType: string;
  status: string;
  score: number | null;
  summary: string | null;
  metadata?: {
    mailHealthCompositeScore?: number;
    infrastructureScore?: number;
    spfParsed?: {
      record: string;
      dnsLookups: number;
      isWeak: boolean;
      weakReason: string | null;
    } | null;
    dmarcParsed?: {
      record: string;
      policy: "none" | "quarantine" | "reject" | "invalid";
      rua: string[];
      ruf: string[];
      adkim: "r" | "s";
      aspf: "r" | "s";
    } | null;
    dkimCount?: number;
    bimiSuccess?: boolean;
    redirectsToHttps?: boolean;
    whois?: {
      success: boolean;
      registrar: string | null;
      createdDate: string | null;
      expiresDate: string | null;
      updatedDate: string | null;
      status: string[];
      nameservers: string[];
      error?: string;
    } | null;
    asnGeo?: {
      success: boolean;
      ipAddress: string | null;
      ipVersion: number | null;
      latitude: number | null;
      longitude: number | null;
      countryName: string | null;
      countryCode: string | null;
      regionName: string | null;
      cityName: string | null;
      zipCode: string | null;
      asn: string | null;
      asName: string | null;
      error?: string;
    } | null;
    reverseDns?: string[] | null;
    ping?: {
      success: boolean;
      latencyMs: number | null;
      port: number | null;
      error?: string;
    } | null;
    cdnWaf?: {
      detected: boolean;
      name: string | null;
      provider: string | null;
    } | null;
    reverseIp?: string[] | null;
    dnsbl?: Array<{
      list: string;
      listed: boolean;
      reason: string | null;
    }> | null;
    traceroute?: Array<{
      hop: number;
      ip: string;
      hostname: string;
      latencyMs: number;
      asn: string | null;
      asnOrg: string | null;
      countryCode: string | null;
      cityName: string | null;
      type: "local" | "isp" | "transit" | "edge" | "destination";
    }> | null;
  } | null;
  createdAt: string;
  completedAt: string | null;
}

interface Finding {
  id: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  recommendation: string | null;
  evidence: any;
  affectedAsset: string | null;
}

interface RunEvent {
  id: string;
  eventType: string;
  message: string;
  createdAt: string;
}

interface Asset {
  id: string;
  assetType: string;
  value: string;
  ip: string | null;
}

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
  const [scanStepIndex, setScanStepIndex] = useState(0);
  const [scanStatusMessage, setScanStatusMessage] = useState('');
  
  // IA Copilot remediation state
  const [isGeneratingCopilot, setIsGeneratingCopilot] = useState(false);
  const [copilotOutput, setCopilotOutput] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<boolean>(false);
  const [copiedBlockIdx, setCopiedBlockIdx] = useState<number | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [copilotViewTab, setCopilotViewTab] = useState<'formatted' | 'html'>('formatted');
  const [copiedHtml, setCopiedHtml] = useState<boolean>(false);

  const consoleEndRef = useRef<HTMLDivElement>(null);

  interface RenderedBlock {
    type: 'h1' | 'h2' | 'h3' | 'code' | 'ul' | 'ol' | 'p';
    content?: string;
    items?: string[];
    language?: string;
  }

  const parseMarkdown = (md: string): RenderedBlock[] => {
    const lines = md.split('\n');
    const blocks: RenderedBlock[] = [];
    let currentBlock: RenderedBlock | null = null;
    let codeLines: string[] = [];
    let inCode = false;
    let codeLang = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.trim().startsWith('```')) {
        if (inCode) {
          blocks.push({
            type: 'code',
            content: codeLines.join('\n'),
            language: codeLang || 'code'
          });
          codeLines = [];
          inCode = false;
          codeLang = '';
        } else {
          inCode = true;
          codeLang = line.trim().substring(3).trim();
        }
        continue;
      }

      if (inCode) {
        codeLines.push(line);
        continue;
      }

      const trimmed = line.trim();

      if (trimmed.startsWith('### ')) {
        blocks.push({ type: 'h3', content: trimmed.substring(4) });
        currentBlock = null;
        continue;
      }
      if (trimmed.startsWith('## ')) {
        blocks.push({ type: 'h2', content: trimmed.substring(3) });
        currentBlock = null;
        continue;
      }
      if (trimmed.startsWith('# ')) {
        blocks.push({ type: 'h1', content: trimmed.substring(2) });
        currentBlock = null;
        continue;
      }

      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const itemContent = trimmed.substring(2);
        if (currentBlock && currentBlock.type === 'ul') {
          currentBlock.items?.push(itemContent);
        } else {
          currentBlock = { type: 'ul', items: [itemContent] };
          blocks.push(currentBlock);
        }
        continue;
      }

      const olMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
      if (olMatch) {
        const itemContent = olMatch[2];
        if (currentBlock && currentBlock.type === 'ol') {
          currentBlock.items?.push(itemContent);
        } else {
          currentBlock = { type: 'ol', items: [itemContent] };
          blocks.push(currentBlock);
        }
        continue;
      }

      if (trimmed === '') {
        currentBlock = null;
        continue;
      }

      if (currentBlock && currentBlock.type === 'p') {
        currentBlock.content += '\n' + line;
      } else {
        currentBlock = { type: 'p', content: line };
        blocks.push(currentBlock);
      }
    }

    if (inCode && codeLines.length > 0) {
      blocks.push({
        type: 'code',
        content: codeLines.join('\n'),
        language: codeLang || 'code'
      });
    }

    return blocks;
  };

  const renderInlineMarkdown = (text: string) => {
    if (!text) return '';
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={idx} className="font-extrabold text-white">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={idx} className="font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-800/30 px-1.5 py-0.5 rounded text-[11px] font-semibold">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  const convertMarkdownToHtml = (md: string): string => {
    if (!md) return '';
    const lines = md.split('\n');
    let html = '';
    let inList = false;
    let listType: 'ul' | 'ol' | null = null;
    let inCode = false;
    let codeLang = '';
    let codeContent: string[] = [];

    const formatInline = (text: string): string => {
      let formatted = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      
      // Bold
      formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      // Inline Code
      formatted = formatted.replace(/`(.*?)`/g, '<code>$1</code>');
      
      return formatted;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Handle Code Blocks
      if (line.trim().startsWith('```')) {
        if (inCode) {
          html += `<pre><code class="language-${codeLang || 'generic'}">${codeContent.join('\n')}</code></pre>\n`;
          codeContent = [];
          inCode = false;
          codeLang = '';
        } else {
          inCode = true;
          codeLang = line.trim().substring(3).trim();
        }
        continue;
      }

      if (inCode) {
        codeContent.push(line
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
        );
        continue;
      }

      // Close open list if we transition to non-list item
      const isListItem = trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s+/.test(trimmed);
      if (inList && (!isListItem || trimmed === '')) {
        html += listType === 'ul' ? '</ul>\n' : '</ol>\n';
        inList = false;
        listType = null;
      }

      if (trimmed === '') {
        continue;
      }

      // Headings
      if (trimmed.startsWith('# ')) {
        html += `<h1>${formatInline(trimmed.substring(2))}</h1>\n`;
        continue;
      }
      if (trimmed.startsWith('## ')) {
        html += `<h2>${formatInline(trimmed.substring(3))}</h2>\n`;
        continue;
      }
      if (trimmed.startsWith('### ')) {
        html += `<h3>${formatInline(trimmed.substring(4))}</h3>\n`;
        continue;
      }

      // Lists
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        if (!inList) {
          html += '<ul>\n';
          inList = true;
          listType = 'ul';
        }
        html += `  <li>${formatInline(trimmed.substring(2))}</li>\n`;
        continue;
      }

      const olMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
      if (olMatch) {
        if (!inList) {
          html += '<ol>\n';
          inList = true;
          listType = 'ol';
        }
        html += `  <li>${formatInline(olMatch[2])}</li>\n`;
        continue;
      }

      // Regular Paragraph
      html += `<p>${formatInline(line)}</p>\n`;
    }

    if (inList) {
      html += listType === 'ul' ? '</ul>\n' : '</ol>\n';
    }
    if (inCode && codeContent.length > 0) {
      html += `<pre><code class="language-${codeLang || 'generic'}">${codeContent.join('\n')}</code></pre>\n`;
    }

    return html;
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

    let idx = 0;
    const interval = setInterval(() => {
      if (idx < steps.length) {
        setScanProgress(prev => [...prev, steps[idx]]);
        setScanStatusMessage(steps[idx].replace(/\[\d+:\d+\] /, ''));
        idx++;
      } else {
        clearInterval(interval);
        onFinish();
      }
    }, 900);
  };

  // Launch scan handler
  const handleLaunchScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetInput.trim()) return;

    const target = targetInput.trim();
    setTargetInput('');

    // Pre-launch validation
    if (!selectedProjectId) {
      setErrorText('Por favor, selecciona un proyecto para vincular el análisis.');
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
      } catch (err: any) {
        setErrorText(`Error de conexión con la API de Inteligencia: ${err.message || err}`);
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
    try {
      const res = await fetch('/api/intelligence/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          investigationId: selectedDetails.investigation.id
        })
      });

      const data = await res.json();
      if (data.success) {
        setCopilotOutput(data.remediationPlan);
      } else {
        setErrorText(data.error || 'No se pudo generar el plan de remediación con IA.');
      }
    } catch (err: any) {
      setErrorText(`Error de comunicación con el motor de IA: ${err.message || err}`);
    } finally {
      setIsGeneratingCopilot(false);
    }
  };

  // Copy to clipboard helper
  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(true);
    setTimeout(() => setCopiedIndex(false), 2000);
  };

  const getScoreRating = (score: number) => {
    if (score >= 90) return { label: 'A - Excelente', color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' };
    if (score >= 80) return { label: 'B - Bueno', color: 'text-teal-400 border-teal-500/20 bg-teal-500/5' };
    if (score >= 70) return { label: 'C - Advertencia', color: 'text-amber-400 border-amber-500/20 bg-amber-500/5' };
    if (score >= 50) return { label: 'D - Alto Riesgo', color: 'text-orange-400 border-orange-500/20 bg-orange-500/5' };
    return { label: 'F - Crítico', color: 'text-rose-400 border-rose-500/20 bg-rose-500/5' };
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
      case 'high':
        return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
      case 'medium':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      case 'low':
        return 'text-teal-400 bg-teal-500/10 border-teal-500/20';
      default:
        return 'text-zinc-400 bg-white/5 border-white/10';
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-8 relative z-10 font-sans text-zinc-100 min-h-[calc(100vh-140px)]">
      
      {/* ─── LEFT PANEL: List of Previous Investigations ─────────────────── */}
      <div className="w-full lg:w-72 shrink-0 flex flex-col gap-6">
        
        {/* Project Selector inside Workspace */}
        <div className="backdrop-blur-xl border border-white/[0.06] bg-white/[0.01] rounded-2xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
            Proyecto Activo
          </label>
          <div className="relative">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full bg-[#07070a] border border-white/[0.08] hover:border-white/[0.15] text-white text-xs font-bold rounded-xl py-3 px-4 outline-none transition-all cursor-pointer appearance-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.8)]"
            >
              {initialProjects.map((proj) => (
                <option key={proj.id} value={proj.id} className="bg-[#07070a] text-white">
                  {proj.name} ({proj.domain})
                </option>
              ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
              ▼
            </div>
          </div>
        </div>

        {/* History List Card */}
        <div className="backdrop-blur-xl border border-white/[0.06] bg-white/[0.01] rounded-2xl flex-1 flex flex-col min-h-[300px] overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
          <div className="p-5 border-b border-white/[0.06] flex items-center justify-between bg-white/[0.005]">
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
              <History className="w-3.5 h-3.5" /> Historial de Análisis
            </h3>
            <span className="text-[10px] bg-white/5 border border-white/10 px-2 py-0.5 rounded-full font-bold">
              {investigations.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-white/[0.04] max-h-[450px]">
            {investigations.length === 0 ? (
              <div className="p-8 text-center flex flex-col items-center justify-center h-full gap-3">
                <ShieldCheck className="w-8 h-8 text-zinc-600" />
                <p className="text-xs text-zinc-500 leading-relaxed">
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
                    className={`w-full text-left p-5 transition-all duration-300 relative group flex flex-col gap-2 ${
                      isActive 
                        ? 'bg-white/[0.02] border-l-2 border-cyan-500' 
                        : 'hover:bg-white/[0.01] border-l-2 border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white group-hover:text-cyan-400 transition-colors truncate max-w-[140px]">
                        {inv.target}
                      </span>
                      {inv.score !== null ? (
                        <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded border ${scoreInfo?.color.split(' ')[0]} ${scoreInfo?.color.split(' ')[1]}`}>
                          {inv.score}
                        </span>
                      ) : (
                        <span className="text-[9px] bg-white/5 border border-white/10 text-zinc-500 px-2 py-0.5 rounded font-bold">
                          Pendiente
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between text-[9px] text-zinc-500 uppercase tracking-wider">
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
          <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-400 text-xs font-bold flex items-center gap-3 animate-in fade-in duration-300">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{errorText}</span>
          </div>
        )}

        {/* Dynamic target launcher header */}
        <div className="backdrop-blur-xl border border-white/[0.06] bg-white/[0.01] rounded-2xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.5)] relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
          
          <div className="relative z-10 flex flex-col gap-6">
            <div>
              <h3 className="font-extrabold text-white text-base tracking-tight">Escanear Infraestructura Cibernética</h3>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-0.5">
                Ingresa un Dominio, IP o URL para auditar registros DNS, SSL, TLS y cabeceras de red
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
                  className="w-full bg-[#07070a]/60 border border-white/[0.08] hover:border-white/[0.15] focus:border-cyan-500/40 text-white font-medium placeholder-zinc-600 text-sm rounded-xl py-3.5 pl-5 pr-12 outline-none transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.8)]"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600">
                  <Globe className="w-4 h-4" />
                </div>
              </div>
              <button
                type="submit"
                disabled={isScanning}
                className="bg-white text-black hover:bg-zinc-200 transition-all font-bold text-xs uppercase tracking-widest px-6 py-3.5 rounded-xl flex items-center gap-2 border border-white cursor-pointer active:scale-95 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed shrink-0 shadow-[0_2px_12px_rgba(0,0,0,0.3)]"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Escaneando
                  </>
                ) : (
                  <>
                    Auditar <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* ─── CASE A: Escaneo activo (Retro Console Timeline Terminal) ────── */}
        {isScanning && (
          <div className="backdrop-blur-xl border border-white/[0.08] bg-[#030305]/95 rounded-2xl overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.8)] relative animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Terminal Top Window Bar */}
            <div className="h-10 px-5 bg-white/[0.02] border-b border-white/[0.06] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
              </div>
              <span className="text-[10px] text-zinc-500 font-mono font-bold tracking-widest flex items-center gap-1.5 uppercase">
                <Terminal className="w-3.5 h-3.5 text-cyan-500" /> terminal://intelligence-engine.v2
              </span>
              <div className="w-8" />
            </div>

            {/* Retro Phosphor Screen Body */}
            <div className="p-8 font-mono text-[11px] leading-relaxed text-cyan-400 bg-[#030305] max-h-[350px] overflow-y-auto flex flex-col gap-2 border-b border-white/[0.04]">
              {scanProgress.map((line, idx) => (
                <div key={idx} className="animate-in fade-in duration-300">
                  {line}
                </div>
              ))}
              <div ref={consoleEndRef} />
            </div>

            {/* Terminal Live Bar Indicator */}
            <div className="p-4 bg-white/[0.005] flex items-center justify-between px-8 text-[10px] text-zinc-500 font-bold uppercase tracking-widest shrink-0">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-500 animate-ping" />
                {scanStatusMessage || 'Inicializando motor...'}
              </span>
              <span>100% SEGURO</span>
            </div>
          </div>
        )}

        {/* ─── CASE B: Mostrando detalles de análisis seleccionado ────────── */}
        {!isScanning && selectedDetails && (
          <div className="space-y-8 animate-in fade-in duration-500">
            
            {/* Bento-Row 1: Posture Score & Vulnerability Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              
              {/* Score Gauge Ring */}
              <div className="backdrop-blur-xl border border-white/[0.06] bg-white/[0.01] rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-6 shadow-[0_8px_30px_rgb(0,0,0,0.5)] md:col-span-1">
                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                  Índice de Seguridad
                </h3>
                
                {selectedDetails.investigation.score !== null ? (
                  <div className="relative flex items-center justify-center">
                    {/* Retro ring container */}
                    <div className="w-36 h-36 rounded-full border-4 border-white/[0.02] flex items-center justify-center flex-col gap-0.5">
                      <span className="text-4xl font-extrabold tracking-tighter text-white">
                        {selectedDetails.investigation.score}
                      </span>
                      <span className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-widest">
                        / 100
                      </span>
                    </div>
                    {/* Glowing outer aura depending on score */}
                    <div className={`absolute inset-0 rounded-full blur-2xl opacity-15 pointer-events-none ${
                      selectedDetails.investigation.score >= 80 ? 'bg-emerald-500' : 'bg-rose-500'
                    }`} />
                  </div>
                ) : (
                  <div className="w-36 h-36 rounded-full border-4 border-dashed border-white/[0.08] flex items-center justify-center text-zinc-600 text-sm font-bold">
                    N/A
                  </div>
                )}

                {selectedDetails.investigation.score !== null && (
                  <div className={`text-[10px] font-extrabold px-3 py-1 rounded-full border uppercase tracking-widest ${
                    getScoreRating(selectedDetails.investigation.score).color
                  }`}>
                    {getScoreRating(selectedDetails.investigation.score).label}
                  </div>
                )}
              </div>

              {/* Vulnerabilities counts, Summary & Target Info */}
              <div className="backdrop-blur-xl border border-white/[0.06] bg-white/[0.01] rounded-2xl p-8 flex flex-col justify-between gap-6 shadow-[0_8px_30px_rgb(0,0,0,0.5)] md:col-span-2">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-widest">
                      Análisis Finalizado
                    </span>
                    <span className="text-[10px] text-zinc-500 font-medium">
                      {new Date(selectedDetails.investigation.createdAt).toLocaleString('es-ES')}
                    </span>
                  </div>
                  <div>
                    <h4 className="font-extrabold text-white text-lg tracking-tight">
                      {selectedDetails.investigation.target}
                    </h4>
                    <p className="text-xs text-zinc-400 leading-relaxed mt-1">
                      {selectedDetails.investigation.summary || 'Análisis de vulnerabilidad técnica de red completado exitosamente.'}
                    </p>
                  </div>
                </div>

                {/* Severity Breakdown boxes */}
                <div className="grid grid-cols-4 gap-4 pt-4 border-t border-white/[0.04]">
                  {[
                    { label: 'Críticos', count: selectedDetails.findings.filter(f => f.severity === 'critical').length, color: 'text-rose-500' },
                    { label: 'Altos', count: selectedDetails.findings.filter(f => f.severity === 'high').length, color: 'text-orange-400' },
                    { label: 'Medios', count: selectedDetails.findings.filter(f => f.severity === 'medium').length, color: 'text-amber-400' },
                    { label: 'Bajos', count: selectedDetails.findings.filter(f => f.severity === 'low').length, color: 'text-teal-400' },
                  ].map((group, idx) => (
                    <div key={idx} className="bg-white/[0.01] border border-white/[0.04] p-3 rounded-xl flex flex-col gap-1 items-center justify-center text-center">
                      <span className={`text-base font-extrabold ${group.color}`}>{group.count}</span>
                      <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest">{group.label}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Bento-Row 1.5: Mail Health & Web Security Audit Panel */}
            {(() => {
              const meta = selectedDetails?.investigation?.metadata || null;
              const mailScore = meta?.mailHealthCompositeScore ?? null;
              const infraScore = meta?.infrastructureScore ?? null;
              
              return (
                <div className="backdrop-blur-xl border border-white/[0.06] bg-white/[0.01] rounded-2xl p-8 flex flex-col gap-6 shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
                  <div>
                    <h3 className="font-extrabold text-white text-base tracking-tight flex items-center gap-2">
                      <Shield className="w-5 h-5 text-cyan-400" />
                      Salud de Correo y Seguridad Web
                    </h3>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-0.5">
                      Diagnóstico granular de protocolos de entrega segura de correo y protección de infraestructura web
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 border-t border-white/[0.04] pt-6">
                    
                    {/* Left Column: Mail Security & Deliverability */}
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-extrabold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                          <Mail className="w-4 h-4 text-cyan-400" />
                          Autenticación de Correo y Reputación
                        </h4>
                        {mailScore !== null && (
                          <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                            mailScore >= 80 ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' : 'text-rose-400 border-rose-500/20 bg-rose-500/5'
                          }`}>
                            Score: {mailScore}/100
                          </span>
                        )}
                      </div>

                      <div className="space-y-4">
                        {/* SPF Card */}
                        <div className="bg-[#07070a]/40 border border-white/[0.04] rounded-xl p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest">
                              SPF (Sender Policy Framework)
                            </span>
                            {meta?.spfParsed ? (
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                                meta.spfParsed.isWeak 
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              }`}>
                                {meta.spfParsed.isWeak ? 'Vulnerable' : 'Seguro'}
                              </span>
                            ) : (
                              <span className="text-[9px] bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded font-bold">
                                No Configurado
                              </span>
                            )}
                          </div>
                          {meta?.spfParsed ? (
                            <div className="space-y-2">
                              <code className="block text-[10px] text-zinc-300 bg-white/[0.02] border border-white/[0.05] p-2 rounded font-mono break-all leading-normal">
                                {meta.spfParsed.record}
                              </code>
                              <div className="flex items-center justify-between text-[9px] text-zinc-500 font-bold uppercase tracking-wider">
                                <span>Consultas DNS: {meta.spfParsed.dnsLookups} / 10</span>
                                <span>Directiva: {meta.spfParsed.isWeak ? 'Débil (SoftFail/Neutral)' : 'Fuerte (HardFail)'}</span>
                              </div>
                              {meta.spfParsed.weakReason && (
                                <p className="text-[9px] text-amber-400/90 bg-amber-500/5 border border-amber-500/10 p-2 rounded leading-relaxed">
                                  ⚠️ {meta.spfParsed.weakReason}
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-[10px] text-zinc-500 leading-relaxed">
                              El dominio no tiene un registro SPF en su zona DNS. Esto permite que cualquier atacante falsifique la identidad del remitente de tus correos institucionales.
                            </p>
                          )}
                        </div>

                        {/* DMARC Card */}
                        <div className="bg-[#07070a]/40 border border-white/[0.04] rounded-xl p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest">
                              DMARC Policy Enforcement
                            </span>
                            {meta?.dmarcParsed && meta.dmarcParsed.policy !== 'invalid' ? (
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                                meta.dmarcParsed.policy === 'reject' 
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                  : meta.dmarcParsed.policy === 'quarantine'
                                  ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              }`}>
                                Política: {meta.dmarcParsed.policy.toUpperCase()}
                              </span>
                            ) : (
                              <span className="text-[9px] bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded font-bold">
                                Inactivo / Inválido
                              </span>
                            )}
                          </div>
                          {meta?.dmarcParsed && meta.dmarcParsed.policy !== 'invalid' ? (
                            <div className="space-y-2">
                              <code className="block text-[10px] text-zinc-300 bg-white/[0.02] border border-white/[0.05] p-2 rounded font-mono break-all leading-normal">
                                {meta.dmarcParsed.record}
                              </code>
                              {meta.dmarcParsed.rua && meta.dmarcParsed.rua.length > 0 && (
                                <div className="text-[9px] text-zinc-500 flex flex-col gap-1">
                                  <span className="font-bold uppercase tracking-wider">Destino de Informes RUA:</span>
                                  <span className="text-zinc-400 font-mono text-[9px] break-all">{meta.dmarcParsed.rua.join(', ')}</span>
                                </div>
                              )}
                              {meta.dmarcParsed.policy === 'none' && (
                                <p className="text-[9px] text-amber-400/90 bg-amber-500/5 border border-amber-500/10 p-2 rounded leading-relaxed">
                                  ⚠️ La política 'p=none' solo monitorea pero no bloquea ni rechaza correos fraudulentos. Se recomienda migrar a 'quarantine' o 'reject'.
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-[10px] text-zinc-500 leading-relaxed">
                              No se detectó una política DMARC válida en el host. DMARC es el escudo definitivo que ordena a los servidores del mundo cómo manejar correos fraudulentos que pretendan ser tuyos.
                            </p>
                          )}
                        </div>

                        {/* DKIM & BIMI Mini-grid */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-[#07070a]/40 border border-white/[0.04] rounded-xl p-3.5 flex flex-col gap-1 justify-between">
                            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">
                              Selectores DKIM
                            </span>
                            <div className="flex items-baseline gap-2 mt-1">
                              <span className="text-xl font-extrabold text-white">
                                {meta?.dkimCount ?? 0}
                              </span>
                              <span className="text-[9px] font-bold text-zinc-400">Encontrados</span>
                            </div>
                            <span className="text-[8px] text-zinc-500 leading-normal mt-1">
                              {meta?.dkimCount && meta.dkimCount > 0 ? '✓ Firmas criptográficas activas.' : '⚠ No se detectaron firmas estándar.'}
                            </span>
                          </div>

                          <div className="bg-[#07070a]/40 border border-white/[0.04] rounded-xl p-3.5 flex flex-col gap-1 justify-between">
                            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">
                              Protocolo BIMI
                            </span>
                            <div className="flex items-baseline gap-2 mt-1">
                              <span className={`text-xs font-extrabold ${meta?.bimiSuccess ? 'text-emerald-400' : 'text-zinc-400'}`}>
                                {meta?.bimiSuccess ? 'Certificado' : 'No detectado'}
                              </span>
                            </div>
                            <span className="text-[8px] text-zinc-500 leading-normal mt-1">
                              {meta?.bimiSuccess ? '✓ Logo corporativo validado.' : 'Logo en bandeja de entrada inactivo.'}
                            </span>
                          </div>
                        </div>

                      </div>
                    </div>

                    {/* Right Column: Web Infrastructure & Security Headers */}
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-extrabold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                          <Server className="w-4 h-4 text-cyan-400" />
                          Seguridad Web e Infraestructura
                        </h4>
                        {infraScore !== null && (
                          <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                            infraScore >= 80 ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' : 'text-rose-400 border-rose-500/20 bg-rose-500/5'
                          }`}>
                            Score: {infraScore}/100
                          </span>
                        )}
                      </div>

                      <div className="space-y-4">
                        {/* HTTPS & Protocol Enforcement */}
                        <div className="bg-[#07070a]/40 border border-white/[0.04] rounded-xl p-4 space-y-3.5">
                          <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block">
                            Seguridad de Conexión y Transporte (TLS)
                          </span>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                                <Lock className="w-4 h-4 text-emerald-400" />
                              </div>
                              <div>
                                <div className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-wider">Redirección HTTPS</div>
                                <div className="text-xs font-bold text-white mt-0.5">
                                  {meta?.redirectsToHttps ? 'Establecida' : 'Faltante / Débil'}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
                                <Cpu className="w-4 h-4 text-cyan-400" />
                              </div>
                              <div>
                                <div className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-wider">Cifrado de Capa</div>
                                <div className="text-xs font-bold text-white mt-0.5">
                                  TLS v1.3 / v1.2
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Web Security Headers Compliance Checklist */}
                        <div className="bg-[#07070a]/40 border border-white/[0.04] rounded-xl p-4 space-y-4">
                          <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block">
                            Cumplimiento de Cabeceras de Seguridad
                          </span>

                          <div className="space-y-3">
                            {[
                              { 
                                name: 'Content-Security-Policy (CSP)', 
                                status: selectedDetails.findings.every(f => !f.title.includes('Content-Security-Policy')),
                                description: 'Mitiga inyecciones XSS y secuestro de datos definiendo orígenes autorizados.' 
                              },
                              { 
                                name: 'Strict-Transport-Security (HSTS)', 
                                status: selectedDetails.findings.every(f => !f.title.includes('Strict-Transport-Security') && !f.description.includes('HSTS')),
                                description: 'Fuerza conexiones cifradas HTTPS de forma estricta en el navegador.' 
                              },
                              { 
                                name: 'X-Frame-Options (Clickjacking Protection)', 
                                status: selectedDetails.findings.every(f => !f.title.includes('X-Frame-Options') && !f.title.includes('Clickjacking')),
                                description: 'Evita que tu sitio web sea embebido de forma fraudulenta en iframes externos.' 
                              },
                              { 
                                name: 'Cookie Security Flags (HttpOnly & Secure)', 
                                status: selectedDetails.findings.every(f => !f.title.includes('HttpOnly') && !f.title.includes('Secure') && !f.title.includes('Cookie')),
                                description: 'Protege las cookies de sesión contra el robo mediante scripts maliciosos.' 
                              }
                            ].map((header, idx) => (
                              <div key={idx} className="flex items-start justify-between gap-4 border-b border-white/[0.02] pb-2.5 last:border-0 last:pb-0">
                                <div className="space-y-0.5">
                                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                                    {header.name}
                                  </span>
                                  <p className="text-[10px] text-zinc-500 leading-normal">
                                    {header.description}
                                  </p>
                                </div>
                                <span className={`px-2 py-0.5 rounded text-[8px] font-extrabold uppercase shrink-0 tracking-wider ${
                                  header.status 
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                }`}>
                                  {header.status ? 'Cumple' : 'Incompleto'}
                                </span>
                              </div>
                            ))}
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
                    <h3 className="font-extrabold text-white text-base tracking-tight flex items-center gap-2">
                      <Globe className="w-5 h-5 text-indigo-400 animate-pulse" />
                      Diagnóstico de Red y OSINT Avanzado
                    </h3>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-0.5">
                      Topología de perímetro de red, enrutamiento de paquetes y análisis de huella pública (Open Source Intelligence)
                    </p>
                  </div>

                  {/* 2x2 grid for main details */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    
                    {/* Card 1: WHOIS & Registro de Dominio */}
                    <div className="backdrop-blur-xl border border-white/[0.06] bg-white/[0.01] rounded-2xl p-6 flex flex-col gap-5 shadow-[0_8px_30px_rgb(0,0,0,0.5)] hover:border-white/[0.1] transition-all duration-300">
                      <div className="flex items-center justify-between border-b border-white/[0.04] pb-3">
                        <h4 className="text-xs font-extrabold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                          <Globe className="w-4 h-4 text-indigo-400" />
                          Información de Registro (WHOIS/RDAP)
                        </h4>
                        {whois?.success && (
                          <span className="text-[9px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                            Dominio Activo
                          </span>
                        )}
                      </div>

                      {whois?.success ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 flex-1">
                          {/* Registrar & Dates */}
                          <div className="space-y-4">
                            <div className="space-y-1">
                              <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest block">Registrador Autorizado</span>
                              <span className="text-sm font-extrabold text-white">{whois.registrar || 'Desconocido'}</span>
                            </div>

                            <div className="space-y-2">
                              <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest block">Fechas de Registro</span>
                              <div className="space-y-1 bg-white/[0.02] border border-white/[0.04] rounded-lg p-2.5">
                                <div className="flex justify-between text-[10px]">
                                  <span className="text-zinc-500 font-bold uppercase">Creado:</span>
                                  <span className="text-zinc-300 font-mono">{whois.createdDate ? new Date(whois.createdDate).toLocaleDateString('es-ES') : 'N/A'}</span>
                                </div>
                                <div className="flex justify-between text-[10px]">
                                  <span className="text-zinc-500 font-bold uppercase">Actualizado:</span>
                                  <span className="text-zinc-300 font-mono">{whois.updatedDate ? new Date(whois.updatedDate).toLocaleDateString('es-ES') : 'N/A'}</span>
                                </div>
                                <div className="flex justify-between text-[10px] border-t border-white/[0.04] pt-1 mt-1">
                                  <span className="text-zinc-500 font-bold uppercase">Expira:</span>
                                  <span className="text-zinc-300 font-mono">{whois.expiresDate ? new Date(whois.expiresDate).toLocaleDateString('es-ES') : 'N/A'}</span>
                                </div>
                              </div>
                            </div>

                            {/* Expiry Alert Badge */}
                            {remainingDays !== null && (
                              <div className={`p-2.5 rounded-lg border text-center ${
                                remainingDays < 60 
                                  ? 'bg-rose-500/5 border-rose-500/20 text-rose-400' 
                                  : remainingDays < 180 
                                  ? 'bg-amber-500/5 border-amber-500/20 text-amber-400' 
                                  : 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
                              }`}>
                                <span className="text-[9px] font-bold uppercase tracking-wider block">Tiempo hasta Renovación</span>
                                <span className="text-sm font-black">{remainingDays} días</span>
                              </div>
                            )}
                          </div>

                          {/* Domain Status & Nameservers */}
                          <div className="space-y-4 flex flex-col">
                            <div className="space-y-1.5">
                              <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest block">Estados de Dominio (Registry Status)</span>
                              <div className="flex flex-wrap gap-1">
                                {whois.status && whois.status.length > 0 ? (
                                  whois.status.slice(0, 3).map((st, idx) => (
                                    <span key={idx} className="text-[8px] font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/50 truncate max-w-full">
                                      {st.split(' ')[0]}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-[9px] text-zinc-500">Ningún estado especial reportado</span>
                                )}
                              </div>
                            </div>

                            <div className="space-y-1.5 flex-1 flex flex-col justify-end">
                              <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest block">Servidores de Nombres (Auth DNS)</span>
                              <div className="bg-white/[0.01] border border-white/[0.04] rounded-lg p-2.5 space-y-1 flex-1 overflow-y-auto max-h-[120px]">
                                {whois.nameservers && whois.nameservers.length > 0 ? (
                                  whois.nameservers.map((ns, idx) => (
                                    <div key={idx} className="flex items-center gap-1.5 text-[9px] text-zinc-400 font-mono">
                                      <span className="w-1 h-1 bg-indigo-500 rounded-full shrink-0"></span>
                                      <span className="truncate">{ns}</span>
                                    </div>
                                  ))
                                ) : (
                                  <span className="text-[9px] text-zinc-500">Ningún servidor DNS delegado</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col justify-center items-center text-center p-6 bg-white/[0.002] border border-dashed border-white/[0.04] rounded-xl gap-2">
                          <Globe className="w-8 h-8 text-zinc-600" />
                          <span className="text-xs font-bold text-zinc-400">Detalles WHOIS No Disponibles</span>
                          <p className="text-[10px] text-zinc-500 max-w-xs leading-relaxed">
                            No se encontraron registros de registro de dominio público para este objetivo. Esto ocurre en IPs directas o subdominios internos.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Card 2: Rendimiento y Escudo Perimetral (TCP Ping & CDN/WAF) */}
                    <div className="backdrop-blur-xl border border-white/[0.06] bg-white/[0.01] rounded-2xl p-6 flex flex-col justify-between shadow-[0_8px_30px_rgb(0,0,0,0.5)] hover:border-white/[0.1] transition-all duration-300 group">
                      <div className="flex items-center justify-between border-b border-white/[0.04] pb-3">
                        <h4 className="text-xs font-extrabold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                          <Activity className="w-4 h-4 text-emerald-400" />
                          Rendimiento y Escudo Perimetral
                        </h4>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                          cdnWaf?.detected 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}>
                          {cdnWaf?.detected ? 'WAF Activo' : 'Sin WAF'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2">
                        {/* Ping Performance with Animated Pulsing Ring */}
                        <div className="flex flex-col items-center justify-center text-center border-r border-white/[0.04] pr-0 md:pr-6 gap-3">
                          <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest block">Latencia de Conexión (TCP Ping)</span>
                          
                          {ping?.success ? (
                            <div className="relative flex items-center justify-center w-24 h-24 mt-1">
                              {/* Pulsing rings */}
                              <div className={`absolute inset-0 rounded-full animate-ping opacity-20 ${
                                ping.latencyMs! < 100 
                                  ? 'bg-emerald-500' 
                                  : ping.latencyMs! < 250 
                                  ? 'bg-amber-500' 
                                  : 'bg-rose-500'
                              }`} style={{ animationDuration: '2s' }}></div>
                              <div className={`absolute -inset-2 rounded-full opacity-10 ${
                                ping.latencyMs! < 100 
                                  ? 'bg-emerald-500' 
                                  : ping.latencyMs! < 250 
                                  ? 'bg-amber-500' 
                                  : 'bg-rose-500'
                              }`}></div>
                              
                              {/* Main latency circle */}
                              <div className={`w-20 h-20 rounded-full border flex flex-col items-center justify-center bg-black/60 shadow-[inset_0_2px_10px_rgba(0,0,0,0.8)] ${
                                ping.latencyMs! < 100 
                                  ? 'border-emerald-500/30' 
                                  : ping.latencyMs! < 250 
                                  ? 'border-amber-500/30' 
                                  : 'border-rose-500/30'
                              }`}>
                                <span className={`text-2xl font-black tracking-tighter ${
                                  ping.latencyMs! < 100 
                                    ? 'text-emerald-400' 
                                    : ping.latencyMs! < 250 
                                    ? 'text-amber-400' 
                                    : 'text-rose-400'
                                }`}>
                                  {ping.latencyMs}
                                </span>
                                <span className="text-[8px] text-zinc-500 uppercase font-black tracking-widest">ms</span>
                              </div>
                            </div>
                          ) : (
                            <div className="w-20 h-20 rounded-full border border-rose-500/20 bg-rose-500/5 flex flex-col items-center justify-center text-center mt-1">
                              <ShieldAlert className="w-8 h-8 text-rose-500 animate-pulse" />
                              <span className="text-[8px] text-rose-400 font-extrabold uppercase mt-1">TIMEOUT</span>
                            </div>
                          )}

                          <span className="text-[9px] text-zinc-400 font-medium">
                            {ping?.success 
                              ? `Handshake TCP puerto ${ping.port} completado` 
                              : `Conexión rechazada o caída (Puertos 80/443)`}
                          </span>
                        </div>

                        {/* WAF Shield details */}
                        <div className="flex flex-col justify-center gap-4">
                          <div className="space-y-2">
                            <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest block">Tecnología Cortafuegos Web (WAF)</span>
                            <div className="flex items-center gap-3 bg-white/[0.02] border border-white/[0.04] p-3 rounded-xl transition-colors duration-300 group-hover:bg-white/[0.04]">
                              <div className={`p-2.5 rounded-lg ${
                                cdnWaf?.detected ? 'bg-indigo-500/10 text-indigo-400' : 'bg-zinc-800 text-zinc-500'
                              }`}>
                                <Shield className={`w-6 h-6 ${cdnWaf?.detected ? 'animate-pulse' : ''}`} />
                              </div>
                              <div>
                                <span className="text-xs font-black text-white block">
                                  {cdnWaf?.detected ? cdnWaf.name : 'Proxy Directo Origin'}
                                </span>
                                <span className="text-[9px] text-zinc-500 font-bold block uppercase tracking-wider mt-0.5">
                                  Proveedor: {cdnWaf?.detected ? cdnWaf.provider : 'Ninguno (Servidor Expuesto)'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <p className="text-[9.5px] text-zinc-500 leading-relaxed">
                            {cdnWaf?.detected 
                              ? `Protección perimetral activa. Las solicitudes maliciosas, ataques DDoS de capa 7 e inyecciones SQL son filtrados por el CDN en el Edge antes de tocar tu servidor.`
                              : `¡Alerta de Perímetro! Al no contar con protección WAF/CDN, la dirección IP real de tu servidor web está expuesta directamente a ataques DDoS, escaneos de puertos automatizados y exploits.`}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Card 3: GeoIP, ASN & PTR (Identidad de Red) */}
                    <div className="backdrop-blur-xl border border-white/[0.06] bg-white/[0.01] rounded-2xl p-6 flex flex-col justify-between shadow-[0_8px_30px_rgb(0,0,0,0.5)] hover:border-white/[0.1] transition-all duration-300">
                      <div className="flex items-center justify-between border-b border-white/[0.04] pb-3">
                        <h4 className="text-xs font-extrabold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                          <Cpu className="w-4 h-4 text-cyan-400" />
                          Geolocalización e Identidad de Red (ASN/PTR)
                        </h4>
                        <span className="text-[9px] text-zinc-500 font-mono uppercase tracking-wider">
                          {asnGeo?.ipVersion ? `IPv${asnGeo.ipVersion}` : 'IP'} Address
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2">
                        {/* Geo Coordinates conceptual map (Beautiful retro scanning radar grid!) */}
                        <div className="flex flex-col items-center justify-center gap-2 bg-[#050508]/60 border border-white/[0.04] rounded-xl p-3 relative overflow-hidden h-[180px]">
                          {/* Conceptual Map Grid Background */}
                          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:14px_14px]"></div>
                          
                          {/* Radial Scanning line */}
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/10 to-transparent w-full h-full animate-[pulse_3s_infinite]" style={{ transform: 'skewX(-20deg)' }}></div>

                          {/* SVG Radar circle & scan lines */}
                          <svg className="w-24 h-24 text-cyan-500/20 absolute z-0 shrink-0" viewBox="0 0 100 100">
                            <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="3 3" />
                            <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="0.5" />
                            <circle cx="50" cy="50" r="15" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="1 2" />
                            <line x1="50" y1="5" x2="50" y2="95" stroke="currentColor" strokeWidth="0.5" />
                            <line x1="5" y1="50" x2="95" y2="50" stroke="currentColor" strokeWidth="0.5" />
                            {/* Scanning blip */}
                            {asnGeo?.success && (
                              <circle cx="65" cy="35" r="3" fill="#22d3ee" className="animate-ping" style={{ animationDuration: '1.5s' }} />
                            )}
                          </svg>

                          <div className="relative z-10 flex flex-col items-center text-center space-y-1">
                            <MapPin className="w-6 h-6 text-cyan-400 animate-bounce" />
                            <span className="text-[10px] font-black text-white">{asnGeo?.cityName}, {asnGeo?.countryCode}</span>
                            <span className="text-[8px] text-zinc-500 font-mono tracking-wider uppercase">Coords: {asnGeo?.latitude?.toFixed(4) ?? '0.0000'}, {asnGeo?.longitude?.toFixed(4) ?? '0.0000'}</span>
                            <span className="text-[9px] bg-cyan-950/40 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded mt-1 max-w-[150px] truncate block font-bold">
                              {asnGeo?.countryName}
                            </span>
                          </div>
                        </div>

                        {/* Network Metadata ASN / Reverse DNS list */}
                        <div className="space-y-4 flex flex-col justify-between">
                          <div className="space-y-1">
                            <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest block">Dirección IP de Destino</span>
                            <span className="text-xs font-mono font-extrabold text-white block bg-white/[0.02] border border-white/[0.04] p-1.5 rounded">{asnGeo?.ipAddress || 'Desconocido'}</span>
                          </div>

                          <div className="space-y-1">
                            <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest block">Sistema Autónomo (ASN)</span>
                            <span className="text-[10px] text-zinc-300 font-bold block">
                              {asnGeo?.asn !== 'Desconocido' ? `ASN: ${asnGeo?.asn}` : 'ASN Desconocido'}
                            </span>
                            <span className="text-[10px] text-zinc-400 font-medium block truncate max-w-[200px]" title={asnGeo?.asName || ''}>
                              {asnGeo?.asName || 'Proveedor de Red Desconocido'}
                            </span>
                          </div>

                          <div className="space-y-1">
                            <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest block">Resolución Inversa (PTR / Reverse DNS)</span>
                            <div className="bg-white/[0.01] border border-white/[0.04] rounded-lg p-2 max-h-[60px] overflow-y-auto font-mono text-[9px] text-zinc-400 space-y-0.5">
                              {reverseDns && reverseDns.length > 0 ? (
                                reverseDns.map((ptr, idx) => (
                                  <div key={idx} className="truncate select-all" title={ptr}>
                                    {ptr}
                                  </div>
                                ))
                              ) : (
                                <span className="text-zinc-600 block text-[9px]">No se encontró registro PTR inverso</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card 4: DNSBL Historial y Vecindario IP */}
                    <div className="backdrop-blur-xl border border-white/[0.06] bg-white/[0.01] rounded-2xl p-6 flex flex-col justify-between shadow-[0_8px_30px_rgb(0,0,0,0.5)] hover:border-white/[0.1] transition-all duration-300">
                      <div className="flex items-center justify-between border-b border-white/[0.04] pb-3">
                        <h4 className="text-xs font-extrabold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                          <Layers className="w-4 h-4 text-violet-400" />
                          Listas Negras (DNSBL) y Dominios Co-alojados
                        </h4>
                        {(() => {
                          const listedCount = dnsbl?.filter(item => item.listed).length || 0;
                          return (
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                              listedCount > 0 
                                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' 
                                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            }`}>
                              {listedCount > 0 ? `${listedCount} Reportes` : 'Limpio'}
                            </span>
                          );
                        })()}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2">
                        {/* DNSBL Status list */}
                        <div className="space-y-3">
                          <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest block">Monitoreo de Listas DNSBL</span>
                          
                          <div className="space-y-2">
                            {dnsbl && dnsbl.length > 0 ? (
                              dnsbl.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between bg-white/[0.01] border border-white/[0.04] p-2 rounded-lg text-[10px]">
                                  <span className="font-extrabold text-zinc-300">{item.list}</span>
                                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                                    item.listed 
                                      ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' 
                                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  }`}>
                                    {item.listed ? 'Reportado' : 'Seguro'}
                                  </span>
                                </div>
                              ))
                            ) : (
                              // Fallback default checks
                              ['Spamhaus ZEN', 'SORBS DNSBL', 'Barracuda BRBL'].map((name, idx) => (
                                <div key={idx} className="flex items-center justify-between bg-white/[0.01] border border-white/[0.04] p-2 rounded-lg text-[10px]">
                                  <span className="font-extrabold text-zinc-300">{name}</span>
                                  <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                    Seguro
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {/* Co-hosted domains neighborhood inspector */}
                        <div className="space-y-2 flex flex-col justify-between">
                          <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest block">Dominios en el mismo Servidor ({reverseIp?.length || 0})</span>
                          
                          <div className="bg-[#050508]/40 border border-white/[0.04] rounded-lg p-2.5 flex-1 flex flex-col justify-between max-h-[120px] overflow-y-auto">
                            {reverseIp && reverseIp.length > 0 ? (
                              <div className="space-y-1">
                                {reverseIp.slice(0, 10).map((dom, idx) => (
                                  <div key={idx} className="flex items-center gap-1.5 text-[9.5px] font-mono text-zinc-400 hover:text-white transition-colors duration-150 truncate">
                                    <span className="w-1 h-1 bg-violet-400 rounded-full shrink-0"></span>
                                    <span className="truncate">{dom}</span>
                                  </div>
                                ))}
                                {reverseIp.length > 10 && (
                                  <div className="text-[8px] text-zinc-600 font-bold uppercase tracking-wider pt-1 border-t border-white/[0.04] text-center">
                                    + {reverseIp.length - 10} dominios adicionales
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-col justify-center items-center text-center p-3 h-full gap-1">
                                <Server className="w-5 h-5 text-zinc-700" />
                                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block">IP Aislada o Compartida</span>
                                <p className="text-[8px] text-zinc-600 leading-relaxed">
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
                  <div className="backdrop-blur-xl border border-white/[0.06] bg-white/[0.01] rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.5)] hover:border-white/[0.1] transition-all duration-300">
                    <div className="flex items-center justify-between border-b border-white/[0.04] pb-3 mb-6">
                      <div>
                        <h4 className="text-xs font-extrabold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                          <Compass className="w-4 h-4 text-pink-400" />
                          Traza Topológica de Tránsito de Paquetes (Visual Traceroute)
                        </h4>
                        <p className="text-[9px] text-zinc-500 mt-0.5">
                          Mapa conceptual interactivo del trayecto y retardos de enrutamiento IP desde la puerta local hasta el destino
                        </p>
                      </div>
                      {traceroute && traceroute.length > 0 && (
                        <span className="text-[9px] bg-pink-500/10 text-pink-400 border border-pink-500/20 px-2 py-0.5 rounded font-mono uppercase tracking-wider font-bold">
                          {traceroute.length} Nodos
                        </span>
                      )}
                    </div>

                    {traceroute && traceroute.length > 0 ? (
                      <div className="relative py-6 overflow-x-auto select-none no-scrollbar">
                        {/* Transit neon trace background line */}
                        <div className="absolute top-1/2 left-8 right-8 h-[2px] bg-gradient-to-r from-indigo-500 via-pink-500 to-cyan-500 -translate-y-1/2 opacity-25 blur-[1px] hidden md:block"></div>
                        <div className="absolute top-1/2 left-8 right-8 h-[1px] bg-gradient-to-r from-indigo-400 via-pink-400 to-cyan-400 -translate-y-1/2 opacity-40 hidden md:block"></div>

                        {/* Steps Grid */}
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center min-w-max gap-8 md:gap-4 px-4 relative z-10">
                          {traceroute.map((hop, index) => {
                            // Determine color based on carrying node type
                            const colorClass = (() => {
                              switch (hop.type) {
                                case 'local': return 'border-zinc-500 bg-zinc-950 text-zinc-400 shadow-[0_0_15px_rgba(255,255,255,0.05)]';
                                case 'isp': return 'border-indigo-500 bg-[#0c0d1b] text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.15)]';
                                case 'transit': return 'border-pink-500 bg-[#1b0c14] text-pink-400 shadow-[0_0_15px_rgba(236,72,153,0.15)]';
                                case 'edge': return 'border-purple-500 bg-[#160c1b] text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.15)]';
                                case 'destination': return 'border-cyan-400 bg-[#0c1b1b] text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.25)]';
                                default: return 'border-zinc-500 bg-zinc-900 text-zinc-400';
                              }
                            })();

                            return (
                              <div key={hop.hop} className="flex flex-row md:flex-col items-center gap-4 md:gap-3 group/hop relative min-w-[150px] max-w-[200px]">
                                {/* Horizontal connector dot */}
                                <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-black text-xs shrink-0 transition-transform duration-300 group-hover/hop:scale-110 relative z-20 ${colorClass}`}>
                                  {hop.hop}
                                </div>

                                {/* Step Label Details */}
                                <div className="space-y-1 text-left md:text-center flex-1">
                                  <div className="flex items-center gap-1.5 md:justify-center">
                                    <span className="text-[10px] font-black text-white block max-w-[140px] truncate" title={hop.hostname}>
                                      {hop.hostname}
                                    </span>
                                    {hop.countryCode && hop.countryCode !== 'LAN' && (
                                      <span className="text-[8px] bg-white/[0.04] text-zinc-500 font-extrabold uppercase px-1 rounded scale-90">
                                        {hop.countryCode}
                                      </span>
                                    )}
                                  </div>
                                  
                                  <span className="text-[9px] font-mono text-zinc-500 block truncate" title={hop.ip}>{hop.ip}</span>
                                  
                                  <span className="text-[9.5px] text-zinc-400 font-bold block leading-snug truncate max-w-[150px]" title={hop.asnOrg || ''}>
                                    {hop.asnOrg}
                                  </span>

                                  {/* Latency badge */}
                                  <div className="pt-1 flex items-center gap-1 md:justify-center">
                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded font-mono ${
                                      hop.latencyMs < 50 
                                        ? 'bg-emerald-500/10 text-emerald-400' 
                                        : hop.latencyMs < 150 
                                        ? 'bg-amber-500/10 text-amber-400' 
                                        : 'bg-rose-500/10 text-rose-400'
                                    }`}>
                                      {hop.latencyMs} ms
                                    </span>
                                    {hop.asn && (
                                      <span className="text-[8px] text-zinc-600 font-mono font-bold select-none">{hop.asn}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col justify-center items-center text-center py-10 bg-white/[0.002] border border-dashed border-white/[0.04] rounded-xl gap-2">
                        <Compass className="w-10 h-10 text-zinc-600 animate-spin" style={{ animationDuration: '6s' }} />
                        <span className="text-xs font-bold text-zinc-400">Generando Topología de Tránsito</span>
                        <p className="text-[10px] text-zinc-500 max-w-xs leading-relaxed">
                          La traza de enrutamiento se modela y mapea en tiempo real según el retardo y la geolocalización detectada para el host objetivo.
                        </p>
                      </div>
                    )}
                  </div>

                </div>
              );
            })()}

            {/* Bento-Row 2: Findings List Accordions */}
            <div className="backdrop-blur-xl border border-white/[0.06] bg-white/[0.01] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
              <div className="p-8 border-b border-white/[0.06] bg-white/[0.005]">
                <h3 className="font-extrabold text-white text-base tracking-tight">Hallazgos e Ineficiencias de Red</h3>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-0.5">
                  Lista de vulnerabilidades clasificadas por severidad con evidencia técnica
                </p>
              </div>

              {selectedDetails.findings.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center justify-center gap-4 bg-white/[0.002]">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                  <div>
                    <h4 className="font-extrabold text-white text-sm">¡Excelente Postura de Seguridad!</h4>
                    <p className="text-xs text-zinc-500 max-w-sm mt-1 mx-auto leading-relaxed">
                      No se encontraron vulnerabilidades o fallas DNS en tu infraestructura de red.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.04]">
                  {selectedDetails.findings.map((finding) => (
                    <div key={finding.id} className="p-8 hover:bg-white/[0.005] transition-all duration-300 flex flex-col gap-4">
                      
                      {/* Header row */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <span className={`text-[9px] font-extrabold uppercase tracking-widest px-3 py-1 rounded border shrink-0 mt-0.5 ${getSeverityBadge(finding.severity)}`}>
                            {finding.severity}
                          </span>
                          <div>
                            <h4 className="font-extrabold text-white text-sm tracking-tight">
                              {finding.title}
                            </h4>
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mt-0.5">
                              Activo Afectado: <span className="text-zinc-300 font-mono font-medium">{finding.affectedAsset || 'General'}</span>
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Description & Recommendations */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-xs leading-relaxed pt-2">
                        <div className="space-y-2">
                          <h5 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                            <Info className="w-3.5 h-3.5" /> Descripción de Falla
                          </h5>
                          <p className="text-zinc-400 font-medium">
                            {finding.description}
                          </p>
                        </div>
                        {finding.recommendation && (
                          <div className="space-y-2">
                            <h5 className="text-[10px] font-bold text-cyan-500 uppercase tracking-widest flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> Recomendación Técnica
                            </h5>
                            <p className="text-zinc-300 font-medium">
                              {finding.recommendation}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Evidence JSON payload */}
                      {finding.evidence && Object.keys(finding.evidence).length > 0 && (
                        <div className="mt-4 bg-[#07070a] border border-white/[0.04] p-5 rounded-xl relative overflow-hidden group">
                          <div className="flex justify-between items-center mb-3">
                            <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest flex items-center gap-1">
                              <Terminal className="w-3 h-3 text-zinc-500" /> Evidencia Técnica Recuperada
                            </span>
                            <button
                              onClick={() => handleCopyToClipboard(JSON.stringify(finding.evidence, null, 2))}
                              className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 hover:text-white transition-colors cursor-pointer"
                            >
                              Copiar Payload
                            </button>
                          </div>
                          <pre className="text-[10px] font-mono text-zinc-400 overflow-x-auto select-all max-h-[140px] leading-relaxed">
                            {JSON.stringify(finding.evidence, null, 2)}
                          </pre>
                        </div>
                      )}

                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bento-Row 3: Discovered Assets Grid */}
            {selectedDetails.assets && selectedDetails.assets.length > 0 && (
              <div className="backdrop-blur-xl border border-white/[0.06] bg-white/[0.01] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
                <div className="p-8 border-b border-white/[0.06] bg-white/[0.005]">
                  <h3 className="font-extrabold text-white text-base tracking-tight">Activos Técnicos Descubiertos</h3>
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-0.5">
                    Infraestructura mapeada durante la auditoría
                  </p>
                </div>

                <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {selectedDetails.assets.map((asset) => (
                    <div key={asset.id} className="backdrop-blur-xl border border-white/[0.04] bg-white/[0.005] p-5 rounded-xl flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-9 h-9 rounded-lg bg-white/[0.02] border border-white/[0.08] flex items-center justify-center text-zinc-500">
                          <Server className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <span className="block text-[8px] font-bold text-zinc-500 uppercase tracking-widest">
                            {asset.assetType}
                          </span>
                          <span className="block text-xs font-bold text-white truncate font-mono mt-0.5">
                            {asset.value}
                          </span>
                        </div>
                      </div>
                      {asset.ip && (
                        <span className="text-[9px] bg-white/5 border border-white/10 text-zinc-400 font-mono px-2 py-0.5 rounded">
                          {asset.ip}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bento-Row 4: IA Remediation Copilot Console */}
            <div className="backdrop-blur-xl border border-white/[0.06] bg-white/[0.01] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.5)] relative">
              <div className="p-8 border-b border-white/[0.06] bg-white/[0.005] flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <h3 className="font-extrabold text-white text-base tracking-tight flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-cyan-400 animate-pulse" /> Copilot de Remediación Técnica con IA
                  </h3>
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-0.5">
                    Genera scripts Nginx, configuraciones DNS y directivas SPF/DMARC a medida
                  </p>
                </div>

                {!copilotOutput && (
                  <button
                    onClick={handleGenerateCopilot}
                    disabled={isGeneratingCopilot}
                    className="bg-gradient-to-r from-cyan-500 to-indigo-500 text-white font-bold text-xs uppercase tracking-widest px-6 py-3.5 rounded-xl flex items-center gap-2 border border-cyan-500/20 cursor-pointer hover:shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed text-center shrink-0 shadow-lg"
                  >
                    {isGeneratingCopilot ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Compilando Plan...
                      </>
                    ) : (
                      <>
                        Generar Plan IA <Sparkles className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Copilot plan output display */}
              {copilotOutput && (
                <div className="p-8 bg-[#040407] space-y-6">
                  
                  {/* Actions & controls bar */}
                  <div className="flex items-center justify-between px-1.5">
                    <span className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5" /> Plan de Acción e Instrucciones de Despliegue
                    </span>
                    <button
                      onClick={() => handleCopyToClipboard(copilotOutput)}
                      className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 hover:text-white transition-colors flex items-center gap-1 bg-white/5 border border-white/10 px-3.5 py-2 rounded-xl cursor-pointer"
                    >
                      {copiedIndex ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" /> ¡Copiado!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" /> Copiar Plan Completo
                        </>
                      )}
                    </button>
                  </div>

                  {/* Rendered remediation content */}
                  <div className="bg-[#08080c] border border-white/[0.04] p-8 rounded-2xl relative">
                    <div className="space-y-6 max-w-none text-zinc-300 leading-relaxed text-xs font-sans">
                      {parseMarkdown(copilotOutput).map((block, idx) => {
                        switch (block.type) {
                          case 'h1':
                            return (
                              <h1 key={idx} className="text-lg font-extrabold text-white flex items-center gap-2 border-b border-white/[0.06] pb-2.5 pt-6 first:pt-0">
                                <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
                                {renderInlineMarkdown(block.content || '')}
                              </h1>
                            );
                          case 'h2':
                            return (
                              <h2 key={idx} className="text-base font-extrabold text-white flex items-center gap-2 border-b border-white/[0.06] pb-2 pt-5 first:pt-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
                                {renderInlineMarkdown(block.content || '')}
                              </h2>
                            );
                          case 'h3':
                            return (
                              <h3 key={idx} className="text-sm font-bold text-white flex items-center gap-2 pt-4 first:pt-0">
                                <span className="w-1 h-1 rounded-full bg-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.6)]" />
                                {renderInlineMarkdown(block.content || '')}
                              </h3>
                            );
                          case 'ul':
                            return (
                              <ul key={idx} className="space-y-2.5 my-3 pl-1.5">
                                {block.items?.map((item, itemIdx) => (
                                  <li key={itemIdx} className="flex items-start gap-2.5 text-zinc-300 text-xs leading-relaxed">
                                    <span className="text-cyan-400 font-bold mt-1 select-none text-[9px]">&bull;</span>
                                    <div className="flex-1">{renderInlineMarkdown(item)}</div>
                                  </li>
                                ))}
                              </ul>
                            );
                          case 'ol':
                            return (
                              <ol key={idx} className="space-y-2.5 my-3 pl-1.5 list-decimal list-inside">
                                {block.items?.map((item, itemIdx) => (
                                  <li key={itemIdx} className="text-zinc-300 text-xs leading-relaxed pl-1">
                                    <span className="flex-1 inline pl-1">{renderInlineMarkdown(item)}</span>
                                  </li>
                                ))}
                              </ol>
                            );
                          case 'code':
                            return (
                              <div key={idx} className="border border-white/[0.06] rounded-xl overflow-hidden my-4 bg-[#0a0a0f] shadow-md">
                                <div className="bg-[#0f0f16] px-4 py-2 border-b border-white/[0.04] flex items-center justify-between text-[10px] font-bold tracking-widest text-zinc-400 uppercase select-none">
                                  <span>{block.language || 'código'}</span>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(block.content || '');
                                      setCopiedBlockIdx(idx);
                                      setTimeout(() => setCopiedBlockIdx(null), 2000);
                                    }}
                                    className="hover:text-white transition-colors flex items-center gap-1 cursor-pointer bg-white/[0.02] hover:bg-white/[0.06] px-2.5 py-1 rounded-md border border-white/[0.04]"
                                  >
                                    {copiedBlockIdx === idx ? (
                                      <>
                                        <Check className="w-3 h-3 text-emerald-400" /> ¡Copiado!
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3 h-3" /> Copiar Código
                                      </>
                                    )}
                                  </button>
                                </div>
                                <pre className="p-4 overflow-x-auto text-[11px] font-mono text-zinc-200 bg-[#040407] leading-relaxed">
                                  <code>{block.content}</code>
                                </pre>
                              </div>
                            );
                          case 'p':
                          default:
                            return (
                              <p key={idx} className="text-zinc-300 leading-relaxed text-xs">
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
                      className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 hover:text-white transition-colors"
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
          <div className="backdrop-blur-xl border border-white/[0.06] bg-white/[0.01] rounded-2xl p-16 text-center flex flex-col items-center justify-center gap-6 shadow-[0_8px_30px_rgb(0,0,0,0.5)] animate-in fade-in duration-500 flex-1">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.02] border border-white/[0.08] flex items-center justify-center text-zinc-500 relative">
              <ShieldCheck className="w-8 h-8 text-zinc-500 animate-pulse" />
              <div className="absolute inset-0 bg-cyan-500/10 rounded-2xl blur-lg animate-ping" />
            </div>
            <div>
              <h4 className="font-extrabold text-white text-base tracking-tight">
                Espacio de Trabajo de Inteligencia de Red
              </h4>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto leading-relaxed mt-2">
                Ingresa una dirección de infraestructura en la barra superior o selecciona un análisis del historial de tu proyecto para comenzar.
              </p>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
