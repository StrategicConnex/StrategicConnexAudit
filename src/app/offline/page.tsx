'use client';

import React from "react";
import { WifiOff, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";

export default function OfflinePage() {
  const t = useTranslations('common');
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        {/* Icono animado */}
        <div className="relative mx-auto mb-8 w-24 h-24">
          <div className="absolute inset-0 rounded-full border border-primary/20 animate-pulse" />
          <div className="absolute inset-2 rounded-full border border-chartreuse/10 animate-ping opacity-50" style={{ animationDuration: "3s" }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <WifiOff size={40} className="text-primary/60" />
          </div>
        </div>

        {/* Título */}
        <h1 className="text-3xl font-bold text-foreground mb-3 tracking-tight">
          {t('offline')}
        </h1>

        {/* Descripción */}
        <p className="text-muted-fg text-sm leading-relaxed mb-8 max-w-sm mx-auto">
          {t('offlineDescription')}
        </p>

        {/* Botón Reintentar */}
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl
                     bg-primary/10 border border-primary/20
                     text-chartreuse text-sm font-semibold
                     hover:bg-primary/20 hover:border-primary/30
                     transition-[background-color,border-color] duration-300 cursor-pointer
                     active:scale-95"
        >
          <RefreshCw size={16} className="animate-spin" style={{ animationDuration: "2s" }} />
          {t('retry')}
        </button>

        {/* Footer */}
        <p className="mt-12 text-2xs text-muted-fg/60 uppercase tracking-widest">
          SCAUDIT Enterprise Network Intelligence
        </p>
      </div>
    </div>
  );
}
