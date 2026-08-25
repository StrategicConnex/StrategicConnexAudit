'use client';

import React, { useState } from 'react';
import { Crosshair, Info } from 'lucide-react';
import { findTechnique, type MitreTechnique } from '@/shared/data/mitre-mapping';

const TACTIC_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Reconnaissance': { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  'Resource Development': { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
  'Initial Access': { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
  'Execution': { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' },
  'Persistence': { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
  'Discovery': { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20' },
  'Collection': { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20' },
  'Command and Control': { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20' },
  'Impact': { bg: 'bg-red-600/10', text: 'text-red-500', border: 'border-red-600/20' },
};

function getTacticColor(tactic: string) {
  return TACTIC_COLORS[tactic] || { bg: 'bg-muted/10', text: 'text-muted-fg', border: 'border-border/50' };
}

export function MitreBadge({ technique, size = 'sm', showTooltip = true }: {
  technique: MitreTechnique;
  size?: 'sm' | 'md';
  showTooltip?: boolean;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const colors = getTacticColor(technique.tactic);
  const sizeClasses = size === 'sm' ? 'text-2xs px-1.5 py-0.5 gap-1' : 'text-2xs px-2.5 py-1 gap-1.5';

  return (
    <span className="relative inline-flex items-center">
      <span
        className={`inline-flex items-center ${sizeClasses} rounded-md border font-bold uppercase tracking-wider ${colors.bg} ${colors.text} ${colors.border} transition-[border-color,filter] hover:brightness-110 cursor-default`}
        onMouseEnter={() => showTooltip && setShowInfo(true)}
        onMouseLeave={() => setShowInfo(false)}
      >
        <Crosshair className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
        <span>{technique.id}</span>
        {size === 'md' && (
          <>
            <span className="opacity-50 mx-0.5">.</span>
            <span className="font-normal normal-case tracking-normal opacity-80">{technique.tactic.split(' ')[0]}</span>
          </>
        )}
      </span>
      {showInfo && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 rounded-xl bg-[#0A0E17] border border-border shadow-[0_8px_32px_rgba(0,0,0,0.8)] z-50 pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-start gap-2.5">
            <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className={`text-2xs font-bold ${colors.text}`}>{technique.id}</span>
                <span className="text-2xs text-muted-fg uppercase tracking-wider">{technique.tactic}</span>
              </div>
              <p className="text-2xs text-foreground/80 leading-relaxed font-medium">{technique.name}</p>
              <p className="text-2xs text-muted-fg leading-relaxed">{technique.description}</p>
              <a href={technique.url} target="_blank" rel="noopener noreferrer" className="text-2xs text-primary hover:text-primary/80 transition-colors block mt-1" onClick={(e) => e.stopPropagation()}>Ver en MITRE ATTACK &rarr;</a>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}

export function AutoMitreBadge({ findingTitle, toolId, size = 'sm', showTooltip = true }: {
  findingTitle: string;
  toolId?: string;
  size?: 'sm' | 'md';
  showTooltip?: boolean;
}) {
  // Use shared MITRE mapping: try toolId first, fallback to keyword matching on title
  const technique = findTechnique(toolId, findingTitle);
  if (!technique) return null;
  return <MitreBadge technique={technique} size={size} showTooltip={showTooltip} />;
}
