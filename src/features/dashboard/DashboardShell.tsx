"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Activity } from "lucide-react";
import { useTranslations } from "next-intl";
import { DashboardSidebar, type DashboardTab } from "./DashboardSidebar";
import { MobileNav, MobileBottomNav } from "./MobileNav";
import { DashboardHeader } from "./DashboardHeader";
import { CommandPalette } from "@/components/CommandPalette";
import { DashboardContentSkeleton } from "./DashboardContentSkeleton";
import { HeroSummary } from "./HeroSummary";
import {
  DashboardUIContext,
  type DashboardChrome,
  type DashboardLiveHero,
} from "./dashboard-ui-context";

const NewProjectModal = dynamic(
  () => import("./NewProjectModal").then((mod) => mod.NewProjectModal),
  { loading: () => <div className="w-9 h-9 bg-muted/30 rounded-lg animate-pulse" /> }
);

const AiCopilot = dynamic(() => import("./AiCopilot").then((mod) => mod.AiCopilot), {
  ssr: false,
});

const NeuralNetworkBackground = dynamic(
  () =>
    import("@/components/NeuralNetworkBackground").then((mod) => ({
      default: mod.NeuralNetworkBackground,
    })),
  { ssr: false, loading: () => null }
);

interface DashboardShellProps {
  /** Pestaña inicial (`/dashboard` abre en portfolio). */
  defaultTab?: DashboardTab;
  /** Parte async de la ruta: los paneles con datos, dentro del Suspense. */
  children: React.ReactNode;
}

/**
 * DashboardShell — chrome del dashboard renderizado FUERA del `<Suspense>`
 * (H-10b F-C).
 *
 * Antes todo (sidebar, header, hero, paneles) vivía dentro del fallback del
 * Suspense, así el `h2` del hero — el elemento LCP de campo — solo existía
 * cuando las queries con RLS terminaban (2–3 s). Aquí el shell pinta con el
 * primer flush del documento (≈ TTFB+CSS): el `h2` fijo del `HeroSummary`
 * entra en ese HTML y no se reemplaza jamás, así que el LCP deja de depender
 * del streaming de datos.
 *
 * Los datos vivos (count de proyectos, iniciales, uptime/alertas) llegan al
 * shell por contexto: `DashboardContainer` publica con `publishChrome` y
 * `OverviewTab` con `publishLive` cuando hidratan. Hasta entonces el chrome
 * muestra placeholders "—" — nunca cifras inventadas.
 *
 * El `<Suspense>` de los paneles vive AQUÍ, dentro del shell: es lo que hace
 * que el hero quede fuera de la frontera de carga.
 */
export function DashboardShell({ defaultTab, children }: DashboardShellProps) {
  const t = useTranslations("overview");
  const [activeTab, setActiveTab] = useState<DashboardTab>(defaultTab || "overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [copilotGenerating, setCopilotGenerating] = useState(false);
  const [chrome, setChrome] = useState<DashboardChrome | null>(null);
  const [live, setLive] = useState<DashboardLiveHero | null>(null);

  const publishChrome = useCallback((c: DashboardChrome) => setChrome(c), []);
  const publishLive = useCallback((l: DashboardLiveHero) => setLive(l), []);
  const ui = useMemo(
    () => ({ activeTab, setActiveTab, chrome, live, publishChrome, publishLive }),
    [activeTab, chrome, live, publishChrome, publishLive]
  );

  return (
    <DashboardUIContext.Provider value={ui}>
      <div className="min-h-screen bg-background text-foreground flex relative overflow-hidden">
        {/* Red neuronal de fondo — z-0, pointer-events none, theme-aware. El
            micro-detalle "listening" se activa mientras el copilot genera. */}
        <NeuralNetworkBackground listening={copilotGenerating} />

        <DashboardSidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          projectCount={chrome ? chrome.initialProjects.length : null}
        />

        {/* Mobile drawer — el sidebar es hidden en <md */}
        <MobileNav
          open={mobileNavOpen}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onClose={() => setMobileNavOpen(false)}
        />

        {/* Barra inferior móvil con las 5 pestañas principales */}
        <MobileBottomNav activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Paleta de comandos global (⌘K) — requiere la lista de proyectos */}
        {chrome && (
          <CommandPalette
            projects={chrome.initialProjects.map((p) => ({
              id: p.id,
              name: p.name,
              domain: p.domain,
            }))}
            onNavigateTab={setActiveTab}
          />
        )}

        {/* Main Content Area — bg transparente para dejar ver la red neuronal */}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 flex flex-col h-screen overflow-hidden"
        >
          <DashboardHeader
            activeTab={activeTab}
            NewProjectModal={NewProjectModal}
            onMenu={() => setMobileNavOpen(true)}
            onNavigateProjects={() => setActiveTab("projects")}
            onOpenSettings={() => setActiveTab("settings")}
            userInitials={chrome?.userInitials}
          />

          <div className="flex-1 overflow-y-auto p-4 sm:p-10 pb-28 sm:pb-32 bg-muted/30 relative z-10">
            <div className="max-w-6xl mx-auto space-y-6">
              {activeTab === "overview" && (
                <>
                  {/* Page title — h1 lives in DashboardHeader; this is the in-content h2 */}
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
                      <Activity aria-hidden="true" className="w-5 h-5 text-primary" />
                      {t("pageTitle")}
                    </h2>
                    <p className="text-sm text-muted-fg mt-0.5">{t("pageSubtitle")}</p>
                  </div>
                  <HeroSummary />
                </>
              )}

              {/* Frontera de carga de los paneles: el hero de arriba NUNCA
                  entra en ella (H-10b F-C). */}
              <Suspense fallback={<DashboardContentSkeleton />}>{children}</Suspense>
            </div>
          </div>
        </main>

        {/* Floating AI Copilot Widget — nace cuando los datos llegan */}
        {chrome && (
          <AiCopilot
            contextData={chrome.dashboardData}
            onGeneratingChange={setCopilotGenerating}
          />
        )}
      </div>
    </DashboardUIContext.Provider>
  );
}
