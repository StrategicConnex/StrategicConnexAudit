"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useIntelligenceStore } from "../stores/intelligence-store";
import { useInvestigationRealtime } from "../hooks/useInvestigationRealtime";
import GlobalTargetCommand from "./GlobalTargetCommand";
import ToolCatalog from "./ToolCatalog";
import { exportIntelligenceToPdf } from "@/shared/utils/exportIntelligencePdf";
import { 
  Sparkles, 
  Terminal, 
  Activity, 
  Layers, 
  ShieldCheck, 
  History, 
  BookOpen, 
  ChevronRight, 
  Cpu, 
  MessageSquare,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  Lock,
  Menu,
  X,
  ArrowLeft,
  Loader2,
  CheckCircle,
  AlertCircle,
  Download
} from "lucide-react";

interface IntelligenceShellProps {
  projectId: string;
}

// Static mock events for onboarding preview when no active investigation is running
const ONBOARDING_PREVIEW_EVENTS = [
  { id: "1", type: "info", tool: "dns.lookup", time: "Hace 2 min", message: "DNS resolvió exitosamente A (104.21.32.22) y AAAA." },
  { id: "2", type: "warning", tool: "email.spf", time: "Hace 5 min", message: "SPF contiene demasiados lookups DNS remotos (11/10 máximo)." },
  { id: "3", type: "success", tool: "tls.scan", time: "Hace 12 min", message: "Cadena de certificados SSL/TLS calificada con A+ por EgressGuard." },
  { id: "4", type: "info", tool: "osint.whois", time: "Hace 20 min", message: "Expiración del dominio registrada para Noviembre 2028." }
];

const ONBOARDING_PREVIEW_EVIDENCES = [
  { id: "e1", title: "SPF Mechanism Overlimit", severity: "medium", source: "email.spf", desc: "La política SPF excede el límite estándar de 10 consultas recursivas. Podría causar rechazo de correos en servidores estrictos." },
  { id: "e2", title: "Certificado SSL Óptimo", severity: "low", source: "tls.scan", desc: "Cifrado TLS v1.3 habilitado. Claves EC de 256 bits sólidas sin vulnerabilidades detectadas." },
  { id: "e3", title: "Servidor expuesto (Puerto 80)", severity: "info", source: "network.port_scan", desc: "Puerto HTTP (80) abierto redireccionando de forma segura mediante 301 Redirect a HTTPS en el puerto 443." }
];

export default function IntelligenceShell({ projectId }: IntelligenceShellProps) {
  const { 
    activeInvestigationId, 
    aiSidebarOpen, 
    toggleAiSidebar, 
    selectedToolId,
    selectedEvidenceId,
    selectEvidence
  } = useIntelligenceStore();

  const {
    investigation,
    findings,
    events,
    isLoading: isRealtimeLoading,
    error: realtimeError
  } = useInvestigationRealtime(activeInvestigationId);

  const [aiMessage, setAiMessage] = useState("");
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [aiChat, setAiChat] = useState<{ role: "user" | "assistant"; text: string }[]>([
    { role: "assistant", text: "Hola. Soy tu Asistente de Inteligencia de Red. Ingresa un objetivo o selecciona una herramienta para comenzar la auditoría." }
  ]);
  const [activeTab, setActiveTab] = useState<"telemetry" | "evidence">("telemetry");
  const [isMobileCatalogOpen, setIsMobileCatalogOpen] = useState(false);

  // Dynamic Mail Health Composite calculations
  const hasSpfMissing = findings.some(f => f.title.toLowerCase().includes("spf inexistente") || f.title.toLowerCase().includes("sin registro spf") || f.title.toLowerCase().includes("falta registro de protección de correo spf"));
  const hasSpfCritical = findings.some(f => f.title.toLowerCase().includes("spf crítica") || f.title.toLowerCase().includes("spf insegura") || f.title.toLowerCase().includes("mecanismo overlimit"));
  const hasSpf = findings.some(f => f.title.toLowerCase().includes("spf") || f.description.toLowerCase().includes("spf"));
  const spfStatus = !activeInvestigationId ? "warning" : hasSpfMissing ? "missing" : hasSpfCritical ? "warning" : hasSpf ? "secure" : "pending";

  const hasDmarcMissing = findings.some(f => f.title.toLowerCase().includes("dmarc") && (f.title.toLowerCase().includes("ausencia") || f.title.toLowerCase().includes("inexistente") || f.title.toLowerCase().includes("sin registro dmarc") || f.title.toLowerCase().includes("falta registro de alineación")));
  const hasDmarcNone = findings.some(f => f.title.toLowerCase().includes("p=none") || f.title.toLowerCase().includes("modo monitoreo"));
  const hasDmarc = findings.some(f => f.title.toLowerCase().includes("dmarc") || f.description.toLowerCase().includes("dmarc"));
  const dmarcStatus = !activeInvestigationId ? "missing" : hasDmarcMissing ? "missing" : hasDmarcNone ? "warning" : hasDmarc ? "secure" : "pending";

  const hasDkimMissing = findings.some(f => f.title.toLowerCase().includes("dkim") && (f.title.toLowerCase().includes("ausencia") || f.title.toLowerCase().includes("inexistente") || f.title.toLowerCase().includes("falta") || f.severity === "high"));
  const hasDkim = findings.some(f => f.title.toLowerCase().includes("dkim") || f.description.toLowerCase().includes("dkim"));
  const dkimStatus = !activeInvestigationId ? "secure" : hasDkimMissing ? "missing" : hasDkim ? "secure" : "pending";

  const hasBimiMissing = findings.some(f => f.title.toLowerCase().includes("bimi") && (f.title.toLowerCase().includes("ausencia") || f.title.toLowerCase().includes("inexistente") || f.title.toLowerCase().includes("falta") || f.severity !== "info"));
  const hasBimi = findings.some(f => f.title.toLowerCase().includes("bimi") || f.description.toLowerCase().includes("bimi"));
  const bimiStatus = !activeInvestigationId ? "pending" : hasBimiMissing ? "warning" : hasBimi ? "secure" : "pending";

  const mailHealthStatusConfig = {
    secure: { bg: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400", label: "Óptimo", subText: "Configuración Correcta", ring: "ring-emerald-500/30" },
    warning: { bg: "bg-amber-500/10 border-amber-500/20 text-amber-400", label: "Aviso", subText: "Configuración Insegura", ring: "ring-amber-500/30" },
    missing: { bg: "bg-red-500/10 border-red-500/20 text-red-400", label: "Crítico", subText: "Falta Protocolo", ring: "ring-red-500/30" },
    pending: { bg: "bg-zinc-800 border-zinc-700 text-zinc-400", label: "Pendiente", subText: "Esperando Escaneo", ring: "ring-zinc-700/30" }
  };

  const handleExportPdf = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      const targetName = investigation?.target || "Onboarding-Demo";
      const filename = `Reporte-Seguridad-${targetName}-${new Date().toISOString().split('T')[0]}.pdf`;
      const success = await exportIntelligenceToPdf(
        "intelligence-report-content",
        filename,
        targetName
      );
      if (!success) {
        alert("Error al exportar el reporte PDF. Por favor, inténtelo de nuevo.");
      }
    } catch (e) {
      console.error("PDF Export Error:", e);
      alert("Error de conexión al generar PDF.");
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Auto-respond when a tool is selected in Zustand to demonstrate cognitive AI response
  useEffect(() => {
    if (selectedToolId) {
      setAiChat((prev) => [
        ...prev,
        { 
          role: "assistant", 
          text: `Has seleccionado la herramienta \`${selectedToolId}\`. Si tienes un objetivo ingresado, esta prueba pasiva recopilará metadatos valiosos analizados bajo la arquitectura EgressGuard.` 
        }
      ]);
    }
  }, [selectedToolId]);

  // Request real-time Copilot remediation plan from backend
  const handleRequestRemediationPlan = async () => {
    if (!activeInvestigationId || isGeneratingPlan) return;
    setIsGeneratingPlan(true);
    setAiChat((prev) => [
      ...prev,
      { role: "user", text: "Genera el plan de remediación completo e interactivo para esta auditoría." }
    ]);

    try {
      const response = await fetch("/api/intelligence/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ investigationId: activeInvestigationId })
      });
      const data = await response.json();
      if (data.success && data.remediationPlan) {
        setAiChat((prev) => [
          ...prev,
          { role: "assistant", text: data.remediationPlan }
        ]);
      } else {
        setAiChat((prev) => [
          ...prev,
          { role: "assistant", text: `⚠️ No se pudo generar el plan: ${data.error || "Error desconocido"}` }
        ]);
      }
    } catch (err: any) {
      setAiChat((prev) => [
        ...prev,
        { role: "assistant", text: `⚠️ Error de conexión al generar el plan: ${err.message || err}` }
      ]);
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const handleSendAi = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiMessage.trim()) return;

    const userText = aiMessage.trim();
    setAiChat((prev) => [...prev, { role: "user", text: userText }]);
    setAiMessage("");

    // Simulate conversational help based on context
    setTimeout(() => {
      let responseText = `He analizado tu consulta sobre "${userText}". Bajo el alcance del proyecto actual, se recomienda ejecutar escaneos pasivos DNS y verificar la alineación SPF/DMARC para mitigar suplantaciones de identidad.`;
      
      if (investigation) {
        responseText = `Evaluando "${userText}" con respecto a la auditoría en curso para ${investigation.target}.\n\nActualmente, el sistema registra una puntuación de postura de ${investigation.score || "pendiente"}/100. Contamos con ${findings.length} evidencias reportadas. Puedes solicitar el plan de remediación estructurado usando el botón superior.`;
      }
      
      setAiChat((prev) => [
        ...prev,
        { role: "assistant", text: responseText }
      ]);
    }, 800);
  };

  return (
    <div className="flex h-screen bg-[#09090b] text-[#e4e4e7] overflow-hidden font-sans">
      
      {/* Mobile Catalog Trigger */}
      <button 
        onClick={() => setIsMobileCatalogOpen(!isMobileCatalogOpen)}
        className="lg:hidden fixed bottom-5 right-5 z-50 flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500 text-[#09090b] shadow-2xl hover:scale-105 active:scale-95 transition-all"
      >
        {isMobileCatalogOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* 1. LEFT PANEL: Tool Directory */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-80 shrink-0 border-r border-[#1f1f23] bg-[#09090b] transform lg:translate-x-0 lg:static transition-transform duration-300 ease-out
        ${isMobileCatalogOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <div className="h-full p-4">
          <ToolCatalog />
        </div>
      </aside>

      {/* Overlay for mobile catalog */}
      {isMobileCatalogOpen && (
        <div 
          onClick={() => setIsMobileCatalogOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* 2. CENTER PANEL: Main Workspace & Shell Cockpit */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#09090b]">
        
        {/* Top Command HUD */}
        <section className="p-4 sm:p-6 border-b border-[#1f1f23] bg-[#0c0c0e]/30 flex flex-col space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Link
                href="/"
                className="flex items-center justify-center w-8 h-8 rounded-lg border border-[#27272a] bg-[#141416] text-[#a1a1aa] hover:text-white hover:border-[#3f3f46] active:scale-95 transition-all"
                title="Volver al Dashboard General"
              >
                <ArrowLeft className="w-4.5 h-4.5" />
              </Link>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-white font-mono flex items-center space-x-2">
                  <Terminal className="w-5 h-5 text-emerald-400" />
                  <span>Auditoría de Red Activa</span>
                </h1>
                <p className="text-xs text-[#71717a] mt-0.5">
                  Consola diagnóstica modular de seguridad perimetral y DNS.
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={handleExportPdf}
                disabled={isExportingPdf}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-[#27272a] bg-[#141416] text-[#a1a1aa] hover:text-[#e4e4e7] hover:border-[#3f3f46] text-xs font-mono transition-all active:scale-95 disabled:opacity-50"
                title="Exportar reporte de seguridad completo a PDF"
              >
                {isExportingPdf ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>{isExportingPdf ? "Generando..." : "Reporte PDF"}</span>
              </button>

              <button
                onClick={toggleAiSidebar}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono transition-all ${
                  aiSidebarOpen 
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-[#141416] border-[#27272a] text-[#a1a1aa] hover:text-[#e4e4e7]"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Copilot AI</span>
              </button>
            </div>
          </div>

          <GlobalTargetCommand 
            projectId={projectId} 
            onSuccess={(id) => {
              setAiChat((prev) => [
                ...prev,
                { role: "assistant", text: `¡Investigación iniciada correctamente! ID asignado: \`${id}\`. Analizando registros SPF, DMARC y DNS recursivamente en segundo plano.` }
              ]);
            }}
          />
        </section>

        {/* Central Workspace Content */}
        <section className="flex-1 overflow-y-auto p-4 sm:p-6 scrollbar-thin">
          <div id="intelligence-report-content" className="space-y-6">
          
          {/* Quick Metrics HUD */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-[#0c0c0e] border border-[#1f1f23] rounded-xl p-4 flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <span className="text-[10px] font-mono text-[#52525b] uppercase tracking-wider">Firewall Status</span>
                <h4 className="text-sm font-semibold text-white mt-0.5">EgressGuard Activo</h4>
              </div>
            </div>

            <div className="bg-[#0c0c0e] border border-[#1f1f23] rounded-xl p-4 flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Activity className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <span className="text-[10px] font-mono text-[#52525b] uppercase tracking-wider">Métricas Escaneadas</span>
                <h4 className="text-sm font-semibold text-white mt-0.5">16 Herramientas Core</h4>
              </div>
            </div>

            <div className="bg-[#0c0c0e] border border-[#1f1f23] rounded-xl p-4 flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                {investigation && (investigation.status === "running" || investigation.status === "queued") ? (
                  <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                ) : (
                  <TrendingUp className="w-5 h-5 text-purple-400" />
                )}
              </div>
              <div>
                <span className="text-[10px] font-mono text-[#52525b] uppercase tracking-wider">Estado Auditoría</span>
                <h4 className="text-sm font-semibold text-white mt-0.5">
                  {investigation ? (
                    investigation.status === "running" ? "Ejecutando escaneo..." :
                    investigation.status === "completed" ? `Completado (Postura: ${investigation.score}/100)` :
                    investigation.status === "failed" ? "Escaneo Fallido" : "Inicializado"
                  ) : (
                    "Esperando Objetivo"
                  )}
                </h4>
              </div>
            </div>
          </div>

          {/* Mail Health Composite Scorecard */}
          <div className="bg-gradient-to-br from-[#0c0c0e] to-[#08080a] border border-[#1f1f23] rounded-2xl p-5 shadow-2xl relative overflow-hidden group">
            {/* Subtle glow border effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-1.5 max-w-md">
                <div className="flex items-center space-x-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest font-semibold font-mono">Telemática de Correo</span>
                </div>
                <h3 className="text-base font-semibold text-white tracking-tight flex items-center space-x-2 font-mono">
                  <span>Scorecard de Salud de Correo Entrante</span>
                </h3>
                <p className="text-xs text-[#a1a1aa] leading-relaxed">
                  Evaluación automatizada de los perímetros de autenticación de correo del dominio objetivo. Previene ataques de spoofing y phishing mediante alineación estricta de políticas.
                </p>
              </div>

              {/* Status score cards grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full md:w-auto md:min-w-[480px]">
                {/* SPF Ring */}
                <div className="bg-[#09090b]/80 border border-[#1f1f23] rounded-xl p-3.5 flex flex-col items-center text-center relative overflow-hidden hover:border-[#27272a] transition-all">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[10px] font-mono ring-4 ${mailHealthStatusConfig[spfStatus].ring} ${mailHealthStatusConfig[spfStatus].bg} mb-2.5 transition-all`}>
                    SPF
                  </div>
                  <span className="text-[10px] font-mono font-semibold text-[#e4e4e7] uppercase">SPF</span>
                  <span className="text-[10px] text-[#71717a] mt-0.5">{mailHealthStatusConfig[spfStatus].label}</span>
                  <p className="text-[9px] text-[#52525b] mt-1 line-clamp-1">{mailHealthStatusConfig[spfStatus].subText}</p>
                </div>

                {/* DMARC Ring */}
                <div className="bg-[#09090b]/80 border border-[#1f1f23] rounded-xl p-3.5 flex flex-col items-center text-center relative overflow-hidden hover:border-[#27272a] transition-all">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[10px] font-mono ring-4 ${mailHealthStatusConfig[dmarcStatus].ring} ${mailHealthStatusConfig[dmarcStatus].bg} mb-2.5 transition-all`}>
                    DMRC
                  </div>
                  <span className="text-[10px] font-mono font-semibold text-[#e4e4e7] uppercase">DMARC</span>
                  <span className="text-[10px] text-[#71717a] mt-0.5">{mailHealthStatusConfig[dmarcStatus].label}</span>
                  <p className="text-[9px] text-[#52525b] mt-1 line-clamp-1">{mailHealthStatusConfig[dmarcStatus].subText}</p>
                </div>

                {/* DKIM Ring */}
                <div className="bg-[#09090b]/80 border border-[#1f1f23] rounded-xl p-3.5 flex flex-col items-center text-center relative overflow-hidden hover:border-[#27272a] transition-all">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[10px] font-mono ring-4 ${mailHealthStatusConfig[dkimStatus].ring} ${mailHealthStatusConfig[dkimStatus].bg} mb-2.5 transition-all`}>
                    DKIM
                  </div>
                  <span className="text-[10px] font-mono font-semibold text-[#e4e4e7] uppercase">DKIM</span>
                  <span className="text-[10px] text-[#71717a] mt-0.5">{mailHealthStatusConfig[dkimStatus].label}</span>
                  <p className="text-[9px] text-[#52525b] mt-1 line-clamp-1">{mailHealthStatusConfig[dkimStatus].subText}</p>
                </div>

                {/* BIMI Ring */}
                <div className="bg-[#09090b]/80 border border-[#1f1f23] rounded-xl p-3.5 flex flex-col items-center text-center relative overflow-hidden hover:border-[#27272a] transition-all">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[10px] font-mono ring-4 ${mailHealthStatusConfig[bimiStatus].ring} ${mailHealthStatusConfig[bimiStatus].bg} mb-2.5 transition-all`}>
                    BIMI
                  </div>
                  <span className="text-[10px] font-mono font-semibold text-[#e4e4e7] uppercase">BIMI</span>
                  <span className="text-[10px] text-[#71717a] mt-0.5">{mailHealthStatusConfig[bimiStatus].label}</span>
                  <p className="text-[9px] text-[#52525b] mt-1 line-clamp-1">{mailHealthStatusConfig[bimiStatus].subText}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Real-time Loading banner if active */}
          {investigation && (investigation.status === "running" || investigation.status === "queued") && (
            <div className="p-4 bg-purple-950/20 border border-purple-500/20 rounded-xl flex items-center space-x-3 text-xs text-purple-300">
              <Loader2 className="w-4 h-4 animate-spin text-purple-400 shrink-0" />
              <span>Ejecutando suite de escaneo de infraestructura en segundo plano de manera segura a través de EgressGuard. Los eventos de ejecución se transmitirán en vivo en la consola inferior a continuación.</span>
            </div>
          )}

          {/* Details Tabs Navigation */}
          <div className="border-b border-[#1f1f23] flex items-center space-x-4">
            <button
              onClick={() => setActiveTab("telemetry")}
              className={`pb-2.5 text-xs font-mono uppercase tracking-wide border-b-2 transition-all ${
                activeTab === "telemetry" 
                  ? "border-emerald-500 text-white font-semibold" 
                  : "border-transparent text-[#71717a] hover:text-[#a1a1aa]"
              }`}
            >
              Línea de Tiempo y Eventos {activeInvestigationId && `(${events.length})`}
            </button>
            <button
              onClick={() => setActiveTab("evidence")}
              className={`pb-2.5 text-xs font-mono uppercase tracking-wide border-b-2 transition-all ${
                activeTab === "evidence" 
                  ? "border-emerald-500 text-white font-semibold" 
                  : "border-transparent text-[#71717a] hover:text-[#a1a1aa]"
              }`}
            >
              Evidencias Encontradas ({activeInvestigationId ? findings.length : ONBOARDING_PREVIEW_EVIDENCES.length})
            </button>
          </div>

          {/* Telemetry Timeline Tab */}
          {activeTab === "telemetry" && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <History className="w-4 h-4 text-[#71717a]" />
                  <span className="text-xs text-[#a1a1aa] font-mono">
                    {activeInvestigationId ? "Eventos en Tiempo Real" : "Ejemplo de Telemetría (No hay auditoría activa)"}
                  </span>
                </div>
                {!activeInvestigationId && (
                  <span className="text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded uppercase font-mono">
                    Demo
                  </span>
                )}
              </div>
              
              <div className="bg-[#0c0c0e] border border-[#1f1f23] rounded-xl overflow-hidden divide-y divide-[#1f1f23]">
                {activeInvestigationId ? (
                  events.length > 0 ? (
                    events.map((event) => (
                      <div key={event.id} className="p-3.5 flex items-start space-x-3 text-xs hover:bg-[#141416]/50 transition-colors">
                        <span className={`font-mono text-[9px] px-2 py-0.5 rounded border ${
                          event.eventType === "error" ? "bg-red-500/10 border-red-500/20 text-red-400" :
                          event.eventType === "success" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                          event.eventType === "warning" ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
                          "bg-[#18181b] border-[#27272a] text-[#a1a1aa]"
                        }`}>
                          {event.eventType.toUpperCase()}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[#e4e4e7] leading-relaxed pr-4 font-mono">{event.message}</p>
                          <span className="text-[10px] text-[#52525b] mt-1 block">
                            {new Date(event.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-xs text-[#71717a] font-mono">
                      Iniciando conexión con Supabase Realtime... Esperando el primer reporte de los escáneres perimetrales.
                    </div>
                  )
                ) : (
                  ONBOARDING_PREVIEW_EVENTS.map((event) => (
                    <div key={event.id} className="p-3.5 flex items-start space-x-3 text-xs opacity-60 hover:bg-[#141416]/50 transition-colors">
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#18181b] border border-[#27272a] text-[#a1a1aa]">
                        {event.tool}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[#e4e4e7] leading-relaxed pr-4">{event.message}</p>
                        <span className="text-[10px] text-[#52525b] mt-1 block">{event.time}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Evidences Tab */}
          {activeTab === "evidence" && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <BookOpen className="w-4 h-4 text-[#71717a]" />
                  <span className="text-xs text-[#a1a1aa] font-mono">
                    {activeInvestigationId ? "Hallazgos de Seguridad Confirmados" : "Muestra de evidencias y recomendaciones (No hay auditoría activa)"}
                  </span>
                </div>
                {!activeInvestigationId && (
                  <span className="text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded uppercase font-mono">
                    Demo
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3">
                {activeInvestigationId ? (
                  findings.length > 0 ? (
                    findings.map((ev) => {
                      const isSelected = selectedEvidenceId === ev.id;
                      return (
                        <div
                          key={ev.id}
                          onClick={() => selectEvidence(isSelected ? null : ev.id)}
                          className={`p-4 border rounded-xl cursor-pointer transition-all duration-300 ${
                            isSelected 
                              ? "bg-[#18181b] border-emerald-500/40 shadow-lg"
                              : "bg-[#0c0c0e] border-[#1f1f23] hover:border-[#27272a]"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-semibold text-white">{ev.title}</span>
                            </div>
                            <span className={`text-[9px] font-mono uppercase font-semibold px-2 py-0.5 rounded ${
                              ev.severity === "critical" || ev.severity === "high" ? "bg-red-500/10 text-red-400 border border-red-500/20" : 
                              ev.severity === "medium" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : 
                              "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                            }`}>
                              Severidad: {ev.severity}
                            </span>
                          </div>
                          <p className="text-xs text-[#a1a1aa] leading-relaxed pr-2">
                            {ev.description}
                          </p>
                          {ev.recommendation && (
                            <div className="mt-3 p-2.5 bg-[#09090b] rounded-lg border border-[#1f1f23] text-[11px] font-mono text-emerald-400/90 leading-normal">
                              <span className="text-[10px] text-[#71717a] block mb-1">RECOMENDACIÓN DE REMEDIACIÓN:</span>
                              {ev.recommendation}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-12 text-center border border-dashed border-[#1f1f23] rounded-xl text-xs text-[#71717a] font-mono">
                      No se han reportado hallazgos aún. Deja que el escaneo avance o ingresa un host válido.
                    </div>
                  )
                ) : (
                  ONBOARDING_PREVIEW_EVIDENCES.map((ev) => {
                    const isSelected = selectedEvidenceId === ev.id;
                    return (
                      <div
                        key={ev.id}
                        onClick={() => selectEvidence(isSelected ? null : ev.id)}
                        className={`p-4 border rounded-xl cursor-pointer opacity-60 transition-all duration-300 ${
                          isSelected 
                            ? "bg-[#18181b] border-emerald-500/40 shadow-lg"
                            : "bg-[#0c0c0e] border-[#1f1f23] hover:border-[#27272a]"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-semibold text-white">{ev.title}</span>
                            <span className="font-mono text-[9px] text-[#71717a] bg-[#141416] px-1.5 py-0.5 rounded border border-[#27272a]">
                              {ev.source}
                            </span>
                          </div>
                          <span className={`text-[9px] font-mono uppercase font-semibold ${
                            ev.severity === "high" ? "text-red-400" : ev.severity === "medium" ? "text-amber-400" : "text-blue-400"
                          }`}>
                            Severidad: {ev.severity}
                          </span>
                        </div>
                        <p className="text-xs text-[#a1a1aa] leading-relaxed pr-2">
                          {ev.desc}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
          </div>
        </section>
      </main>

      {/* 3. RIGHT PANEL: AI Co-Pilot Security Advisor Sidebar */}
      <aside className={`
        relative border-l border-[#1f1f23] bg-[#0c0c0e] shrink-0 h-full flex flex-col transition-all duration-300 ease-in-out
        ${aiSidebarOpen ? "w-80 opacity-100" : "w-0 opacity-0 overflow-hidden border-l-0"}
      `}>
        {/* Advisor Header */}
        <div className="p-4 border-b border-[#1f1f23] bg-[#09090b] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
            <h3 className="text-xs font-semibold text-[#e4e4e7] tracking-wider uppercase font-mono">
              Asistente IA
            </h3>
          </div>
          <button 
            onClick={toggleAiSidebar}
            className="p-1 rounded hover:bg-[#1f1f23] text-[#71717a] hover:text-[#e4e4e7] transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* AI Action button to request premium remediation plan */}
        {activeInvestigationId && (
          <div className="p-3 border-b border-[#1f1f23] bg-[#09090b]/40">
            <button
              onClick={handleRequestRemediationPlan}
              disabled={isGeneratingPlan || (investigation?.status !== "completed" && investigation?.status !== "failed" && investigation?.status !== "running")}
              className="w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-xs font-mono hover:bg-emerald-500/20 active:scale-98 transition-all disabled:opacity-40 disabled:scale-100"
            >
              {isGeneratingPlan ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Generando Plan...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generar Plan Coplilot IA</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* AI Chat History */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
          {aiChat.map((msg, idx) => (
            <div 
              key={idx} 
              className={`flex flex-col space-y-1 p-3 rounded-xl text-xs max-w-[90%] transition-all ${
                msg.role === "user" 
                  ? "bg-zinc-100 text-zinc-950 ml-auto border border-zinc-200" 
                  : "bg-[#141416] border border-[#27272a] text-[#e4e4e7] mr-auto"
              }`}
            >
              <span className="text-[9px] font-mono font-medium tracking-wide uppercase opacity-60">
                {msg.role === "user" ? "Yo" : "Copilot Audit"}
              </span>
              <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
            </div>
          ))}
        </div>

        {/* AI Input Box */}
        <form onSubmit={handleSendAi} className="p-4 border-t border-[#1f1f23] bg-[#09090b]/50">
          <div className="relative flex items-center bg-[#141416] border border-[#27272a] rounded-xl p-1 focus-within:border-[#3f3f46]">
            <input
              type="text"
              value={aiMessage}
              onChange={(e) => setAiMessage(e.target.value)}
              placeholder="Pregunta sobre puertos, SPF..."
              className="flex-1 bg-transparent border-0 outline-none text-xs text-[#e4e4e7] placeholder-[#52525b] py-2.5 px-3"
            />
            <button
              type="submit"
              disabled={!aiMessage.trim()}
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-white active:scale-95 disabled:opacity-30 disabled:scale-100 transition-all"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </aside>

    </div>
  );
}
