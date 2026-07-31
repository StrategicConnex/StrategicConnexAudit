"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useIntelligenceStore } from "../stores/intelligence-store";
import { useInvestigationRealtime } from "../hooks/useInvestigationRealtime";
import { useApiHealth } from "../hooks/useApiHealth";
import { useMailHealthStatus } from "../hooks/useMailHealthStatus";
import { useAiChat } from "../hooks/useAiChat";
import GlobalTargetCommand from "./GlobalTargetCommand";
import ToolCatalog from "./ToolCatalog";
import { ApiHealthBadge } from "./ApiHealthBadge";
import { QuickMetricsHud } from "./QuickMetricsHud";
import { MailHealthScorecard } from "./MailHealthScorecard";
import { TelemetryTimeline } from "./TelemetryTimeline";
import { EvidencesList } from "./EvidencesList";
import { TopologyView } from "./TopologyView";
import { AiCopilotSidebar } from "./AiCopilotSidebar";
import { Terminal, ArrowLeft, Download, Sparkles, Menu, X, Loader2 } from "lucide-react";
import { LiveMetricsBar } from "@/app/components/LiveMetricsBar";

// ─── Demo Data ──────────────────────────────────────────────────────────────

const DEMO_EVENTS = [
  { id: "1", type: "info", tool: "dns.lookup", time: "Hace 2 min", message: "DNS resolvió exitosamente A (104.21.32.22) y AAAA." },
  { id: "2", type: "warning", tool: "email.spf", time: "Hace 5 min", message: "SPF contiene demasiados lookups DNS remotos (11/10 máximo)." },
  { id: "3", type: "success", tool: "tls.scan", time: "Hace 12 min", message: "Cadena de certificados SSL/TLS calificada con A+." },
  { id: "4", type: "info", tool: "osint.whois", time: "Hace 20 min", message: "Expiración del dominio registrada para Noviembre 2028." },
];

const DEMO_EVIDENCES = [
  { id: "e1", title: "SPF Mechanism Overlimit", severity: "medium", source: "email.spf", desc: "La política SPF excede el límite estándar de 10 consultas recursivas." },
  { id: "e2", title: "Certificado SSL Óptimo", severity: "low", source: "tls.scan", desc: "Cifrado TLS v1.3 habilitado. Claves EC de 256 bits." },
  { id: "e3", title: "Servidor expuesto (Puerto 80)", severity: "info", source: "network.port_scan", desc: "Puerto HTTP (80) abierto redireccionando mediante 301 Redirect a HTTPS." },
];

// ─── Tab Types ──────────────────────────────────────────────────────────────

type TabId = "telemetry" | "evidence" | "topology";

const TABS: { id: TabId; label: string; countKey?: "events" | "findings" }[] = [
  { id: "telemetry", label: "Línea de Tiempo y Eventos", countKey: "events" },
  { id: "evidence", label: "Evidencias Encontradas", countKey: "findings" },
  { id: "topology", label: "Superficie de Ataque" },
];

// ─── Component ──────────────────────────────────────────────────────────────

interface IntelligenceShellProps {
  projectId: string;
}

export default function IntelligenceShell({ projectId }: IntelligenceShellProps) {
  // State from Zustand
  const {
    activeInvestigationId, aiSidebarOpen, toggleAiSidebar,
    selectedToolId, selectedEvidenceId, selectEvidence,
  } = useIntelligenceStore();

  // Custom hooks
  const { investigation, findings, events } = useInvestigationRealtime(activeInvestigationId);
  const { health: apiHealth, loading: healthLoading, refresh: refreshHealth } = useApiHealth();
  const mailStatus = useMailHealthStatus(findings, activeInvestigationId);
  const { messages, isGenerating, sendMessage, requestRemediationPlan, addAssistantMessage } = useAiChat();

  // Local state
  const [aiMessage, setAiMessage] = useState("");
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("telemetry");
  const [isMobileCatalogOpen, setIsMobileCatalogOpen] = useState(false);

  // Auto-respond when a tool is selected
  useEffect(() => {
    if (selectedToolId) {
      addAssistantMessage(
        `Has seleccionado la herramienta \`${selectedToolId}\`. Si tienes un objetivo ingresado, esta prueba pasiva recopilará metadatos valiosos.`
      );
    }
  }, [selectedToolId, addAssistantMessage]);

  // ─── Handlers ──────────────────────────────────────────────────────────

  const handleExportPdf = useCallback(async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      // Dynamic import: html2canvas + jsPDF (~412KB) only loads when the user
      // actually exports — keeps them out of the /intelligence route bundle.
      const { exportIntelligenceToPdf } = await import("@/shared/utils/exportIntelligencePdf");
      const targetName = investigation?.target || "Onboarding-Demo";
      const filename = `Reporte-Seguridad-${targetName}-${new Date().toISOString().split("T")[0]}.pdf`;
      const success = await exportIntelligenceToPdf("intelligence-report-content", filename, targetName);
      if (!success) alert("Error al exportar el reporte PDF.");
    } catch (e) {
      console.error("PDF Export Error:", e);
    } finally {
      setIsExportingPdf(false);
    }
  }, [isExportingPdf, investigation]);

  const handleSendAi = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!aiMessage.trim()) return;
      sendMessage(aiMessage);
      setAiMessage("");
    },
    [aiMessage, sendMessage],
  );

  const handleRequestRemediation = useCallback(() => {
    if (activeInvestigationId) requestRemediationPlan(activeInvestigationId);
  }, [activeInvestigationId, requestRemediationPlan]);

  const handleScanSuccess = useCallback(
    (id: string) => {
      addAssistantMessage(`¡Investigación iniciada! ID: \`${id}\`. Analizando SPF, DMARC y DNS en segundo plano.`);
    },
    [addAssistantMessage],
  );

  const hasActiveInvestigation = !!activeInvestigationId;
  const isRunning = investigation?.status === "running" || investigation?.status === "queued";

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans radar-grid">
      {/* Mobile Catalog Trigger */}
      <button
        onClick={() => setIsMobileCatalogOpen(!isMobileCatalogOpen)}
        className="lg:hidden fixed bottom-5 right-5 z-50 flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500 text-background shadow-2xl hover:scale-105 active:scale-95 transition-all"
      >
        {isMobileCatalogOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* 1. LEFT PANEL: Tool Directory */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-80 shrink-0 border-r border-border bg-background transform lg:translate-x-0 lg:static transition-transform duration-300 ease-out ${
          isMobileCatalogOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-full p-4">
          <ToolCatalog />
        </div>
      </aside>

      {isMobileCatalogOpen && (
        <div onClick={() => setIsMobileCatalogOpen(false)} className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden" />
      )}

      {/* 2. CENTER PANEL */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-background ambient-mesh">
        {/* Top Command HUD */}
        <section className="relative p-4 sm:p-6 border-b border-border bg-muted/30 flex flex-col space-y-4 overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent animate-scan-pulse" />
            <div className="absolute top-1 left-[15%] w-2 h-2 rounded-full bg-emerald-400/20 animate-ping" />
            <div className="absolute top-1 right-[25%] w-1 h-1 rounded-full bg-cyan-400/30 animate-ping" style={{ animationDelay: "0.5s" }} />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Link
                href="/"
                className="flex items-center justify-center w-8 h-8 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:border-secondary active:scale-95 transition-all"
                title="Volver al Dashboard"
              >
                <ArrowLeft className="w-4.5 h-4.5" />
              </Link>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-foreground font-mono flex items-center space-x-2 group/title">
                  <Terminal className="w-5 h-5 text-emerald-400 scan-pulse" />
                  <span className="group-hover/title:animate-glitch transition-all">Auditoría de Red Activa</span>
                </h1>
                <p className="text-xs text-muted-fg mt-0.5">Consola diagnóstica modular de seguridad perimetral y DNS.</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <ApiHealthBadge health={apiHealth} loading={healthLoading} onRefresh={refreshHealth} />

              <button
                onClick={handleExportPdf}
                disabled={isExportingPdf}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted text-muted-fg hover:text-foreground hover:border-border text-xs font-mono transition-all active:scale-95 disabled:opacity-50"
                title="Exportar reporte PDF"
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
                    : "bg-muted border-border text-muted-fg hover:text-foreground"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Copilot AI</span>
              </button>
            </div>
          </div>

          <GlobalTargetCommand projectId={projectId} onSuccess={handleScanSuccess} />
        </section>

        {/* Central Workspace */}
        <section className="flex-1 overflow-y-auto p-4 sm:p-6 scrollbar-thin animate-fade-in">
          <div id="intelligence-report-content" className="space-y-6">
            <QuickMetricsHud investigation={investigation} />
            <MailHealthScorecard status={mailStatus} />

            {isRunning && (
              <div className="p-4 bg-purple-950/20 border border-purple-500/20 rounded-xl flex items-center space-x-3 text-xs text-purple-300">
                <Loader2 className="w-4 h-4 animate-spin text-purple-400 shrink-0" />
                <span>Ejecutando suite de escaneo. Los eventos se transmitirán en vivo en la consola inferior.</span>
              </div>
            )}

            {/* Tab Navigation */}
            <div className="border-b border-border flex items-center space-x-4">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`pb-2.5 text-xs font-mono uppercase tracking-wide border-b-2 transition-all ${
                    activeTab === tab.id
                      ? "border-emerald-500 text-foreground font-semibold"
                      : "border-transparent text-muted-fg hover:text-muted-fg"
                  }`}
                >
                  {tab.label}
                  {tab.countKey === "events" && hasActiveInvestigation && <span> ({events.length})</span>}
                  {tab.countKey === "findings" && hasActiveInvestigation && <span> ({findings.length})</span>}
                  {tab.countKey === "findings" && !hasActiveInvestigation && <span> ({DEMO_EVIDENCES.length})</span>}
                </button>
              ))}
            </div>

            {activeTab === "telemetry" && (
              <TelemetryTimeline
                events={events}
                isActive={hasActiveInvestigation}
                isDemo={!hasActiveInvestigation}
                demoEvents={DEMO_EVENTS}
              />
            )}

            {activeTab === "evidence" && (
              <EvidencesList
                findings={findings}
                selectedEvidenceId={selectedEvidenceId}
                onSelectEvidence={selectEvidence}
                isDemo={!hasActiveInvestigation}
                demoFindings={DEMO_EVIDENCES}
              />
            )}

            {activeTab === "topology" && <TopologyView projectId={projectId} />}
          </div>
        </section>
      </main>

      {/* 3. RIGHT PANEL: AI Copilot */}
      <AiCopilotSidebar
        isOpen={aiSidebarOpen}
        onToggle={toggleAiSidebar}
        messages={messages}
        inputValue={aiMessage}
        onInputChange={setAiMessage}
        onSubmit={handleSendAi}
        isGenerating={isGenerating}
        onRequestRemediation={handleRequestRemediation}
        hasActiveInvestigation={hasActiveInvestigation}
        investigationStatus={investigation?.status}
      />

      <LiveMetricsBar projectId={projectId} investigationId={activeInvestigationId ?? undefined} />
    </div>
  );
}
