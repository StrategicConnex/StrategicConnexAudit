"use client";

import React from "react";
import type { MailHealthStatus, MailStatus } from "../hooks/useMailHealthStatus";
import { MAIL_HEALTH_STYLES } from "../hooks/useMailHealthStatus";

interface MailHealthScorecardProps {
  status: MailHealthStatus;
}

function StatusRing({ label, status }: { label: string; status: MailStatus }) {
  const styles = MAIL_HEALTH_STYLES[status];
  return (
    <div className="bg-background/80 border border-border rounded-xl p-3.5 flex flex-col items-center text-center relative overflow-hidden hover:border-border transition-colors">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[10px] font-mono ring-4 ${styles.ring} ${styles.bg} mb-2.5 transition-colors`}>
        {label}
      </div>
      <span className="text-[10px] font-mono font-semibold text-foreground uppercase">
        {label === "DMRC" ? "DMARC" : label}
      </span>
      <span className="text-[10px] text-muted-fg mt-0.5">{styles.label}</span>
      <p className="text-[9px] text-muted-fg mt-1 line-clamp-1">{styles.subText}</p>
    </div>
  );
}

export function MailHealthScorecard({ status }: MailHealthScorecardProps) {
  return (
    <div className="bg-gradient-to-br from-card to-background border border-border rounded-2xl p-5 shadow-2xl relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1.5 max-w-md">
          <div className="flex items-center space-x-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest font-semibold">
              Telemática de Correo
            </span>
          </div>
          <h3 className="text-base font-semibold text-foreground tracking-tight flex items-center space-x-2 font-mono">
            <span>Scorecard de Salud de Correo Entrante</span>
          </h3>
          <p className="text-xs text-muted-fg leading-relaxed">
            Evaluación automatizada de los perímetros de autenticación de correo del dominio objetivo.
            Previene ataques de spoofing y phishing mediante alineación estricta de políticas.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full md:w-auto md:min-w-[480px]">
          <StatusRing label="SPF" status={status.spf} />
          <StatusRing label="DMRC" status={status.dmarc} />
          <StatusRing label="DKIM" status={status.dkim} />
          <StatusRing label="BIMI" status={status.bimi} />
        </div>
      </div>
    </div>
  );
}
