"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useIntelligenceStore } from "../stores/intelligence-store";
import GlobalTargetCommand from "./GlobalTargetCommand";
import ToolCatalog from "./ToolCatalog";
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
  ArrowLeft
} from "lucide-react";

interface IntelligenceShellProps {
  projectId: string;
}

// Mock active events to provide instant, visually stunning telemetry upon loading
const MOCK_EVENTS = [
  { id: "1", type: "info", tool: "dns.lookup", time: "Hace 2 min", message: "DNS resolvió exitosamente A (104.21.32.22) y AAAA." },
  { id: "2", type: "warning", tool: "email.spf", time: "Hace 5 min", message: "SPF contiene demasiados lookups DNS remotos (11/10 máximo)." },
  { id: "3", type: "success", tool: "tls.scan", time: "Hace 12 min", message: "Cadena de certificados SSL/TLS calificada con A+ por EgressGuard." },
  { id: "4", type: "info", tool: "osint.whois", time: "Hace 20 min", message: "Expiración del dominio registrada para Noviembre 2028." }
];

const MOCK_EVIDENCES = [
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

  const [aiMessage, setAiMessage] = useState("");
  const [aiChat, setAiChat] = useState<{ role: "user" | "assistant"; text: string }[]>([
    { role: "assistant", text: "Hola. Soy tu Asistente de Inteligencia de Red. Ingresa un objetivo o selecciona una herramienta para comenzar la auditoría." }
  ]);
  const [activeTab, setActiveTab] = useState<"telemetry" | "evidence">("telemetry");
  const [isMobileCatalogOpen, setIsMobileCatalogOpen] = useState(false);

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

  const handleSendAi = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiMessage.trim()) return;

    const userText = aiMessage.trim();
    setAiChat((prev) => [...prev, { role: "user", text: userText }]);
    setAiMessage("");

    setTimeout(() => {
      setAiChat((prev) => [
        ...prev,
        { 
          role: "assistant", 
          text: `He analizado tu consulta sobre "${userText}". Bajo el alcance del proyecto actual, se recomienda ejecutar escaneos pasivos DNS y verificar la alineación SPF/DMARC para mitigar suplantaciones de identidad.` 
        }
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

      {/* 1. LEFT PANEL: Tool Directory (Responsive sliding drawer on mobile) */}
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
        <section className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 scrollbar-thin">
          
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
                <h4 className="text-sm font-semibold text-white mt-0.5">26 Módulos Disponibles</h4>
              </div>
            </div>

            <div className="bg-[#0c0c0e] border border-[#1f1f23] rounded-xl p-4 flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <span className="text-[10px] font-mono text-[#52525b] uppercase tracking-wider">Modo Ejecución</span>
                <h4 className="text-sm font-semibold text-white mt-0.5">Diagnóstico Continuo</h4>
              </div>
            </div>
          </div>

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
              Línea de Tiempo y Eventos
            </button>
            <button
              onClick={() => setActiveTab("evidence")}
              className={`pb-2.5 text-xs font-mono uppercase tracking-wide border-b-2 transition-all ${
                activeTab === "evidence" 
                  ? "border-emerald-500 text-white font-semibold" 
                  : "border-transparent text-[#71717a] hover:text-[#a1a1aa]"
              }`}
            >
              Evidencias Encontradas ({MOCK_EVIDENCES.length})
            </button>
          </div>

          {/* Telemetry Timeline Tab */}
          {activeTab === "telemetry" && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center space-x-2">
                <History className="w-4 h-4 text-[#71717a]" />
                <span className="text-xs text-[#a1a1aa] font-mono">Eventos Recientes de Auditoría</span>
              </div>
              
              <div className="bg-[#0c0c0e] border border-[#1f1f23] rounded-xl overflow-hidden divide-y divide-[#1f1f23]">
                {MOCK_EVENTS.map((event) => (
                  <div key={event.id} className="p-3.5 flex items-start space-x-3 text-xs hover:bg-[#141416]/50 transition-colors">
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-[#18181b] border border-[#27272a] text-[#a1a1aa]">
                      {event.tool}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[#e4e4e7] leading-relaxed pr-4">{event.message}</p>
                      <span className="text-[10px] text-[#52525b] mt-1 block">{event.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Evidences Tab */}
          {activeTab === "evidence" && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center space-x-2">
                <BookOpen className="w-4 h-4 text-[#71717a]" />
                <span className="text-xs text-[#a1a1aa] font-mono">Registros de Seguridad y Hallazgos</span>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {MOCK_EVIDENCES.map((ev) => {
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
                })}
              </div>
            </div>
          )}

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
