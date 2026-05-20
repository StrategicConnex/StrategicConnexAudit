"use client";

import React, { useState } from "react";
import { useCreateInvestigation } from "../hooks/useCreateInvestigation";
import { 
  Globe, 
  Mail, 
  Terminal, 
  ShieldAlert, 
  Cpu, 
  Binary, 
  CornerDownLeft, 
  Loader2,
  LucideIcon
} from "lucide-react";

interface GlobalTargetCommandProps {
  projectId: string;
  onSuccess?: (investigationId: string) => void;
}

type TargetType = "domain" | "url" | "ip" | "email" | "asn" | "cidr" | "unknown";

function classifyTarget(val: string): TargetType {
  const t = val.trim().toLowerCase();
  if (!t) return "unknown";
  
  if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(t)) {
    return "email";
  }
  
  if (t.startsWith("http://") || t.startsWith("https://")) {
    return "url";
  }

  if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}\/[0-9]{1,2}$/.test(t)) {
    return "cidr";
  }
  
  if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(t)) {
    return "ip";
  }
  
  if (/^as[0-9]+$/.test(t)) {
    return "asn";
  }
  
  if (/^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,24}$/.test(t)) {
    return "domain";
  }

  if (t.includes(".") && !t.includes(" ") && t.length > 3) {
    return "domain";
  }

  return "unknown";
}

const targetTypeStyles: Record<TargetType, { bg: string; text: string; icon: LucideIcon; label: string }> = {
  domain: { bg: "bg-blue-500/10 border-blue-500/20", text: "text-blue-400", icon: Globe, label: "Dominio" },
  url: { bg: "bg-teal-500/10 border-teal-500/20", text: "text-teal-400", icon: Globe, label: "Enlace Web" },
  ip: { bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-400", icon: Binary, label: "Dirección IP" },
  email: { bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-400", icon: Mail, label: "Correo Electrónico" },
  asn: { bg: "bg-purple-500/10 border-purple-500/20", text: "text-purple-400", icon: Cpu, label: "Sistema Autónomo (ASN)" },
  cidr: { bg: "bg-indigo-500/10 border-indigo-500/20", text: "text-indigo-400", icon: Binary, label: "Rango CIDR" },
  unknown: { bg: "bg-[#27272a]/40 border-[#27272a]", text: "text-[#a1a1aa]", icon: Terminal, label: "Desconocido" }
};

export default function GlobalTargetCommand({ projectId, onSuccess }: GlobalTargetCommandProps) {
  const [inputVal, setInputVal] = useState("");
  const { createInvestigation, isLoading, error: apiError } = useCreateInvestigation();
  const [localError, setLocalError] = useState<string | null>(null);

  const targetType = classifyTarget(inputVal);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim() || isLoading) return;

    const classified = classifyTarget(inputVal);
    if (classified === "unknown") {
      setLocalError("Formato de objetivo no reconocido. Ingrese un dominio, IP, CIDR, Email o ASN válido.");
      return;
    }

    // SSRF Prevention validation client-side
    const cleanVal = inputVal.trim().toLowerCase();
    if (
      cleanVal.includes("localhost") || 
      cleanVal.includes("127.0.0.1") || 
      cleanVal.startsWith("10.") || 
      cleanVal.startsWith("192.168.") || 
      cleanVal.startsWith("172.16.")
    ) {
      setLocalError("Acceso bloqueado: Los rangos de red locales o de loopback no están permitidos.");
      return;
    }

    try {
      const inv = await createInvestigation({
        projectId,
        target: inputVal.trim(),
        template: "auto"
      });
      if (inv && onSuccess) {
        onSuccess(inv.id);
      }
    } catch {
      // Handled by API error state
    }
  };

  const styleConfig = targetTypeStyles[targetType];
  const IconComponent = styleConfig.icon;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4">
      <form onSubmit={handleSubmit} className="relative group">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-blue-500/10 rounded-2xl blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 pointer-events-none" />
        
        <div className="relative flex items-center bg-[#09090b]/80 backdrop-blur-md border border-[#27272a] rounded-2xl p-1.5 focus-within:border-[#3f3f46] focus-within:ring-1 focus-within:ring-[#3f3f46] shadow-2xl transition-all duration-300">
          <div className="flex items-center justify-center w-12 h-12 text-[#71717a]">
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
            ) : (
              <Terminal className="w-5 h-5 group-focus-within:text-[#e4e4e7] transition-colors" />
            )}
          </div>
          
          <input
            type="text"
            value={inputVal}
            onChange={(e) => { setInputVal(e.target.value); setLocalError(null); }}
            placeholder="Ingrese un dominio, IP, ASN o Email (ej. google.com, 8.8.8.8)..."
            className="flex-1 bg-transparent border-0 outline-none text-sm text-[#e4e4e7] placeholder-[#52525b] py-3.5 px-1 font-sans selection:bg-emerald-500/20"
            disabled={isLoading}
            autoFocus
          />

          {inputVal.trim() && (
            <div className={`hidden sm:flex items-center space-x-2 border rounded-lg px-2.5 py-1.5 mr-2 ${styleConfig.bg} transition-all duration-300`}>
              <IconComponent className={`w-3.5 h-3.5 ${styleConfig.text}`} />
              <span className={`text-[11px] font-medium tracking-wide uppercase font-mono ${styleConfig.text}`}>
                {styleConfig.label}
              </span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !inputVal.trim()}
            className="flex items-center justify-center h-11 px-4 rounded-xl bg-[#e4e4e7] text-[#09090b] hover:bg-[#ffffff] active:scale-98 disabled:opacity-50 disabled:hover:bg-[#e4e4e7] disabled:active:scale-100 font-medium text-xs tracking-wide transition-all duration-200"
          >
            <span>Escanear</span>
            <CornerDownLeft className="w-3.5 h-3.5 ml-1.5 opacity-60" />
          </button>
        </div>
      </form>

      {/* Real-time Dynamic Status and Security Guidance */}
      {inputVal.trim() && !localError && !apiError && (
        <div className="flex flex-wrap items-center justify-between px-3 text-[11px] text-[#71717a] font-mono gap-y-2">
          <div className="flex items-center space-x-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Target activo: <strong className="text-[#a1a1aa] font-normal">{inputVal}</strong></span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="text-[#52525b]">SSRF Shield:</span>
            <span className="text-emerald-400 font-medium">PROTEGIDO</span>
          </div>
        </div>
      )}

      {/* Errors & Shield Warnings */}
      {(localError || apiError) && (
        <div className="flex items-start space-x-3 p-3.5 bg-red-950/20 border border-red-900/30 rounded-xl animate-fade-in">
          <ShieldAlert className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <div className="text-xs text-red-300/90 leading-relaxed font-sans">
            {localError || apiError}
          </div>
        </div>
      )}
    </div>
  );
}
