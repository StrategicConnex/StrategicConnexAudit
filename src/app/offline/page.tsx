'use client';

import React from "react";
import { WifiOff, RefreshCw } from "lucide-react";

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-[#060608] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        {/* Icono animado */}
        <div className="relative mx-auto mb-8 w-24 h-24">
          <div className="absolute inset-0 rounded-full border border-[#6366f1]/20 animate-pulse" />
          <div className="absolute inset-2 rounded-full border border-[#a3e635]/10 animate-ping opacity-50" style={{ animationDuration: "3s" }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <WifiOff size={40} className="text-[#6366f1]/60" />
          </div>
        </div>

        {/* Título */}
        <h1 className="text-3xl font-bold text-white mb-3 tracking-tight">
          Sin Conexión
        </h1>

        {/* Descripción */}
        <p className="text-[#a1a1aa] text-sm leading-relaxed mb-8 max-w-sm mx-auto">
          No pudimos conectar con nuestros servidores.
          <br />
          Verificá tu conexión a internet y volvé a intentarlo.
        </p>

        {/* Botón Reintentar */}
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl
                     bg-[#6366f1]/10 border border-[#6366f1]/20
                     text-[#a3e635] text-sm font-semibold
                     hover:bg-[#6366f1]/20 hover:border-[#6366f1]/30
                     transition-all duration-300 cursor-pointer
                     active:scale-95"
        >
          <RefreshCw size={16} className="animate-spin" style={{ animationDuration: "2s" }} />
          Reintentar
        </button>

        {/* Footer */}
        <p className="mt-12 text-2xs text-[#52525b] uppercase tracking-widest">
          SCAUDIT Enterprise Network Intelligence
        </p>
      </div>
    </div>
  );
}
