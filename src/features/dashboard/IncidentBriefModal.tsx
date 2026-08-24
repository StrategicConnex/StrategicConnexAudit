'use client';

import { useState } from 'react';
import { X, FileText, AlertTriangle, Clock, Target, Shield, Zap, ChevronDown, ChevronUp, Copy, Check, Loader2 } from 'lucide-react';

interface IncidentBriefProps {
  investigationId: string;
  target: string;
  score: number | null;
  criticalCount: number;
  highCount: number;
  onClose: () => void;
}

interface BriefSection {
  title: string;
  content: string;
  icon: React.ReactNode;
  color: string;
}

function parseBriefSections(brief: string): BriefSection[] {
  const sections: BriefSection[] = [];
  const iconMap: Record<string, { icon: React.ReactNode; color: string }> = {
    'resumen': { icon: <FileText className="w-3.5 h-3.5" />, color: 'text-primary' },
    'timeline': { icon: <Clock className="w-3.5 h-3.5" />, color: 'text-primary' },
    'activos': { icon: <Target className="w-3.5 h-3.5" />, color: 'text-[oklch(75% 0.13 80)]' },
    'vector': { icon: <AlertTriangle className="w-3.5 h-3.5" />, color: 'text-destructive' },
    'acciones': { icon: <Zap className="w-3.5 h-3.5" />, color: 'text-chartreuse' },
    'impacto': { icon: <Shield className="w-3.5 h-3.5" />, color: 'text-destructive/80' },
  };

  const lines = brief.split('\n');
  let currentSection: BriefSection | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ') || line.startsWith('# ')) {
      if (currentSection && currentLines.length > 0) {
        currentSection.content = currentLines.join('\n').trim();
        sections.push(currentSection);
        currentLines = [];
      }
      const title = line.replace(/^#+\s*/, '').trim();
      const key = Object.keys(iconMap).find(k => title.toLowerCase().includes(k)) || 'default';
      currentSection = {
        title,
        content: '',
        icon: iconMap[key]?.icon || <FileText className="w-3.5 h-3.5" />,
        color: iconMap[key]?.color || 'text-muted-fg',
      };
    } else if (currentSection) {
      currentLines.push(line);
    }
  }

  if (currentSection && currentLines.length > 0) {
    currentSection.content = currentLines.join('\n').trim();
    sections.push(currentSection);
  }

  // Fallback: if no sections parsed, put all as one
  if (sections.length === 0 && brief.trim()) {
    sections.push({
      title: 'Resumen Ejecutivo',
      content: brief,
      icon: <FileText className="w-3.5 h-3.5" />,
      color: 'text-primary',
    });
  }

  return sections;
}

export function IncidentBriefModal({
  investigationId,
  target,
  score,
  criticalCount,
  highCount,
  onClose,
}: IncidentBriefProps) {
  const [brief, setBrief] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<number, boolean>>({});

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/intelligence/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investigationId }),
      });
      const data = await res.json();
      if (data.success && data.brief) {
        setBrief(data.brief);
        // Expand all sections by default
        const expanded: Record<number, boolean> = {};
        parseBriefSections(data.brief).forEach((_, i) => { expanded[i] = true; });
        setExpandedSections(expanded);
      } else {
        setError(data.error || 'Error generando el brief.');
      }
    } catch {
      setError('Error de red. Intenta nuevamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (brief) {
      navigator.clipboard.writeText(brief);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const sections = brief ? parseBriefSections(brief) : [];
  const severityColor = score != null
    ? score >= 70 ? 'border-[oklch(75% 0.13 80)]/30 bg-[oklch(75% 0.13 80)]/5' : 'border-destructive/30 bg-destructive/10'
    : 'border-border/30 bg-muted/10';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl max-h-[90vh] bg-card border border-border rounded-2xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-6 duration-300">
        
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b border-border rounded-t-2xl ${severityColor}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
              <FileText className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <h2 className="font-extrabold text-foreground text-base tracking-tight flex items-center gap-2">
                Incident Brief
                <span className="text-[9px] font-black uppercase tracking-widest bg-destructive/15 text-destructive border border-destructive/25 px-2 py-0.5 rounded">
                  {criticalCount > 0 ? 'CRÍTICO' : 'ALTO'}
                </span>
              </h2>
              <p className="text-[11px] text-muted-fg mt-0.5 font-mono">{target}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {brief && (
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 text-[10px] font-bold text-muted-fg hover:text-white bg-muted/30 hover:bg-muted/50 border border-border px-3 py-2 rounded-lg transition-colors cursor-pointer"
              >
                {copied ? <Check aria-hidden="true" className="w-3.5 h-3.5 text-chartreuse" /> : <Copy aria-hidden="true" className="w-3.5 h-3.5" />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Cerrar Incident Brief"
              className="p-2 hover:bg-muted/40 rounded-lg text-muted-fg hover:text-white transition-colors cursor-pointer"
            >
              <X aria-hidden="true" className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-4 px-6 py-3 border-b border-border/50 bg-muted/5">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-destructive" />
            <span className="text-[10px] font-extrabold text-muted-fg uppercase tracking-wider">{criticalCount} Críticos</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[oklch(75% 0.13 80)]" />
            <span className="text-[10px] font-extrabold text-muted-fg uppercase tracking-wider">{highCount} Altos</span>
          </div>
          {score != null && (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-[10px] font-extrabold text-muted-fg uppercase tracking-wider">Score: {score}/100</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[9px] text-muted-fg font-mono">
              {new Date().toLocaleString('es-ES')}
            </span>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          {!brief && !isLoading && !error && (
            <div className="flex flex-col items-center justify-center py-16 gap-6 px-8">
              <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
                <FileText className="w-8 h-8 text-destructive" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="font-extrabold text-foreground text-base">Generar Incident Brief</h3>
                <p className="text-xs text-muted-fg max-w-sm leading-relaxed">
                  El motor de IA analizará los {criticalCount + highCount} hallazgos de alta severidad y generará un documento ejecutivo estructurado con timeline, vectores de ataque y acciones de remediación priorizadas.
                </p>
              </div>
              <button
                onClick={handleGenerate}
                className="flex items-center gap-2 bg-destructive/15 hover:bg-destructive/25 border border-destructive/30 text-destructive font-extrabold text-sm px-6 py-3 rounded-xl transition-[color,background-color,border-color,transform] duration-300 hover:scale-[1.02] cursor-pointer"
              >
                <Zap className="w-4 h-4" />
                Generar Brief con IA
              </button>
            </div>
          )}

          {isLoading && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="w-8 h-8 text-destructive animate-spin" />
              <div className="text-center space-y-1">
                <p className="text-sm font-bold text-foreground">Generando Incident Brief...</p>
                <p className="text-xs text-muted-fg">Analizando hallazgos con motor de IA</p>
              </div>
              {/* Animated steps */}
              <div className="space-y-2 font-mono text-[10px] text-muted-fg mt-2">
                {['Correlacionando hallazgos críticos...', 'Construyendo timeline del incidente...', 'Evaluando vectores de ataque...', 'Redactando recomendaciones ejecutivas...'].map((step, i) => (
                  <div key={i} className="flex items-center gap-2" style={{ animationDelay: `${i * 0.4}s` }}>
                    <div className="w-1.5 h-1.5 rounded-full bg-destructive/60 animate-pulse" style={{ animationDelay: `${i * 0.3}s` }} />
                    {step}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="m-6 p-4 bg-destructive/10 border border-destructive/20 rounded-xl flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-destructive">{error}</p>
                <button onClick={handleGenerate} className="text-[10px] text-muted-fg hover:text-white mt-1.5 transition-colors cursor-pointer">
                  Reintentar →
                </button>
              </div>
            </div>
          )}

          {brief && sections.length > 0 && (
            <div className="p-6 space-y-3">
              {sections.map((section, idx) => (
                <div
                  key={idx}
                  className="border border-border/40 rounded-xl overflow-hidden bg-muted/5 animate-in slide-in-from-bottom-2 duration-300"
                  style={{ animationDelay: `${idx * 80}ms` }}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedSections(prev => ({ ...prev, [idx]: !prev[idx] }))}
                    className="w-full flex items-center justify-between p-4 cursor-pointer hover:bg-muted/10 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={section.color}>{section.icon}</span>
                      <span className="text-xs font-extrabold text-foreground">{section.title}</span>
                    </div>
                    {expandedSections[idx]
                      ? <ChevronUp className="w-3.5 h-3.5 text-muted-fg" />
                      : <ChevronDown className="w-3.5 h-3.5 text-muted-fg" />
                    }
                  </button>

                  {expandedSections[idx] && (
                    <div className="px-4 pb-4 border-t border-border/50">
                      <div className="pt-3 text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap font-sans">
                        {section.content}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border/50 bg-card rounded-b-2xl flex items-center justify-between">
          <p className="text-[9px] font-extrabold text-muted-fg uppercase tracking-widest">
            IA Experimental · Verificar datos críticos con equipo técnico
          </p>
          {brief && (
            <button
              onClick={handleGenerate}
              className="text-[10px] font-bold text-muted-fg hover:text-white transition-colors cursor-pointer"
            >
              Regenerar →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
