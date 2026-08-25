'use client';

import { useState } from 'react';
import { Check, Copy, Loader2, Sparkles, Terminal } from 'lucide-react';
import { parseMarkdown, splitInlineMarkdown } from '@/features/intelligence/lib/rendering/markdown';

interface CopilotConsoleProps {
  output: string | null;
  isGenerating: boolean;
  step: number;
  planCopied: boolean;
  onGenerate: () => void;
  /** Copia el plan completo al portapapeles (dispara el feedback del padre) */
  onCopyPlan: () => void;
  onReset: () => void;
}

// Renderizador inline delegado al paquete puro de rendering (C01).
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
        <code key={idx} className="font-mono text-primary bg-primary/10 border-primary/20 px-1.5 py-0.5 rounded text-2xs font-semibold">
          {token.content}
        </code>
      );
    }
    return token.content;
  });
};

const COPILOT_STEPS = [
  { stepNum: 1, text: 'Leyendo evidencias de red normalizadas...' },
  { stepNum: 2, text: 'Correlacionando brechas DNS con directivas OWASP...' },
  { stepNum: 3, text: 'Redactando código de remediación automatizado...' },
  { stepNum: 4, text: 'Compilando configuraciones Nginx, Apache y DNS TXT...' },
  { stepNum: 5, text: 'Verificando consistencia semántica del plan...' },
];

/**
 * Bento-Row 4 del detalle de investigación: consola del Copilot de
 * remediación con IA (loader neural + salida markdown renderizada).
 * Extraído del monolito IntelligenceTab.
 */
export function CopilotConsole({
  output,
  isGenerating,
  step,
  planCopied,
  onGenerate,
  onCopyPlan,
  onReset,
}: CopilotConsoleProps) {
  const [copiedBlockIdx, setCopiedBlockIdx] = useState<number | null>(null);

  return (
    <div className="glass-card overflow-hidden relative">
      <div className="p-8 border-b border-border bg-muted/1 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h3 className="font-extrabold text-foreground text-base tracking-tight flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary animate-pulse" /> Copilot de Remediación Técnica con IA
          </h3>
          <p className="text-2xs font-bold text-muted-fg uppercase tracking-widest mt-0.5">
            Genera scripts Nginx, configuraciones DNS y directivas SPF/DMARC a medida
          </p>
        </div>

        {!output && !isGenerating && (
          <button
            onClick={onGenerate}
            disabled={isGenerating}
            className="bg-gradient-to-r from-primary to-primary/80 text-foreground font-bold text-xs uppercase tracking-widest px-6 py-3.5 rounded-xl flex items-center gap-2 border border-primary/20 cursor-pointer hover:shadow-[0_0_20px_rgba(98,113,196,0.3)] hover:brightness-110 active:scale-95 transition-[color,background-color,border-color,opacity,box-shadow,transform,filter] disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed text-center shrink-0 shadow-lg"
          >
            Generar Plan IA <Sparkles className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Copilot plan loader workspace */}
      {isGenerating && (
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
              <span className="text-2xs bg-muted/40 text-primary border border-primary/20 px-3.5 py-1.5 rounded-full font-mono font-bold tracking-widest animate-pulse uppercase">
                AI_COPILOT_REASONING
              </span>
            </div>
          </div>

          {/* Right Side: Step-by-Step Interactive Scanning Checklist Log */}
          <div className="w-full lg:w-1/2 p-6 rounded-2xl bg-muted/60 border border-border/70 relative overflow-hidden font-mono text-2xs leading-relaxed text-muted-fg pl-6 lg:pl-8 text-left shadow-[inset_0_1px_2px_rgba(255,255,255,0.05)]">
            {/* Retro console scan lines overlay */}
            <div className="absolute inset-0 pointer-events-none bg-scanlines opacity-[0.03]" />

            <div className="flex items-center gap-2 border-b border-border pb-3 mb-4">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-destructive/80 animate-pulse" />
                <div className="w-2 h-2 rounded-full bg-[oklch(75% 0.13 80)]/80" />
                <div className="w-2 h-2 rounded-full bg-chartreuse/80" />
              </div>
              <span className="text-2xs font-black text-muted-fg uppercase tracking-widest ml-2">CONSOLA DE EJECUCIÓN CO-PILOTO</span>
            </div>

            <div className="space-y-3.5 font-mono">
              {COPILOT_STEPS.map((s) => {
                const isActive = step === s.stepNum;
                const isDone = step > s.stepNum;
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
      {output && (
        <div className="p-8 bg-background space-y-6">

          {/* Actions & controls bar */}
          <div className="flex items-center justify-between px-1.5">
            <span className="text-2xs font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5" /> Plan de Acción e Instrucciones de Despliegue
            </span>
            <button
              onClick={onCopyPlan}
              className="text-2xs font-bold uppercase tracking-widest text-muted-fg hover:text-foreground transition-colors flex items-center gap-1 bg-muted/5 border border-border/50 px-3.5 py-2 rounded-xl cursor-pointer"
            >
              {planCopied ? (
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
              {parseMarkdown(output).map((block, idx) => {
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
                            <span className="text-primary font-bold mt-1 select-none text-2xs">&bull;</span>
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
                        <div className="bg-[#0f0f16] px-4 py-2 border-b border-border/50 flex items-center justify-between text-2xs font-bold tracking-widest text-muted-fg uppercase select-none">
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
                        <pre className="p-4 overflow-x-auto text-2xs font-mono text-foreground/80 bg-background leading-relaxed">
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
              onClick={onReset}
              className="text-2xs font-bold uppercase tracking-widest text-muted-fg hover:text-foreground transition-colors"
            >
              Volver a Generar
            </button>
          </div>

        </div>
      )}
    </div>
  );
}
