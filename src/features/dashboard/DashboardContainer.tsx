'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { DashboardSidebar, type DashboardTab } from './DashboardSidebar';
import { MobileNav } from './MobileNav';
import { DashboardHeader } from './DashboardHeader';
import { NeuralNetworkBackground } from '@/components/NeuralNetworkBackground';
import { OverviewTab } from './tabs/OverviewTab';
import { TabSkeleton } from './TabSkeleton';
import { loadIntelligenceTab } from './tab-loaders';
import type { KeywordItem } from './tabs/KeywordsTab';

/**
 * Only OverviewTab (the default, above-the-fold view) is eagerly imported.
 * Every other tab is code-split behind next/dynamic so its chunk — and any
 * heavy chart library it pulls (recharts, reactflow, leaflet, etc.) — only
 * downloads when the user actually opens that tab.
 */
const IntelligenceTab = dynamic(loadIntelligenceTab, {
  loading: () => <IntelligenceTabSkeleton />,
});

const ProjectsTab = dynamic(() => import('./tabs/ProjectsTab').then(mod => ({ default: mod.ProjectsTab })), {
  loading: () => <TabSkeleton />,
});

const PerformanceTab = dynamic(() => import('./tabs/PerformanceTab').then(mod => ({ default: mod.PerformanceTab })), {
  loading: () => <TabSkeleton />,
});

const KeywordsTab = dynamic(() => import('./tabs/KeywordsTab').then(mod => ({ default: mod.KeywordsTab })), {
  loading: () => <TabSkeleton />,
});

const ReportsTab = dynamic(() => import('./tabs/ReportsTab').then(mod => ({ default: mod.ReportsTab })), {
  loading: () => <TabSkeleton />,
});

const SettingsTab = dynamic(() => import('./tabs/SettingsTab').then(mod => ({ default: mod.SettingsTab })), {
  loading: () => <TabSkeleton />,
});

const MonitoringTab = dynamic(() => import('./tabs/MonitoringTab').then(mod => ({ default: mod.MonitoringTab })), {
  loading: () => <TabSkeleton />,
});

const AdversaryTab = dynamic(() => import('./tabs/AdversaryTab').then(mod => ({ default: mod.AdversaryTab })), {
  loading: () => <TabSkeleton />,
});

const MarketplaceTab = dynamic(() => import('./tabs/MarketplaceTab').then(mod => ({ default: mod.MarketplaceTab })), {
  loading: () => <TabSkeleton />,
});

// Note: `IntelligenceTabSkeleton` is referenced by the dynamic() definition
// above — ESM hoists imports, so this stays valid. Keep the import in this
// file (do not delete when reordering).
import { IntelligenceTabSkeleton } from './IntelligenceTabSkeleton';

import { useAiReport } from './useAiReport';
import {
  listKeywordData, addKeywordTarget, removeKeywordTarget,
  addCompetitor, removeCompetitor, importKeywordCsv,
  type GscTotals, type CompetitorRow,
} from '@/app/actions/keywords';

const NewProjectModal = dynamic(() => import('./NewProjectModal').then(mod => mod.NewProjectModal), {
  loading: () => <div className="w-9 h-9 bg-muted/30 rounded-lg animate-pulse" />,
});

const AiCopilot = dynamic(() => import('./AiCopilot').then(mod => mod.AiCopilot), { ssr: false });

import { ProjectWithNested, type ProjectRow } from '@/shared/db/types';

interface DashboardContainerProps {
  initialProjects: ProjectRow[];
  dashboardData: ProjectWithNested[];
  defaultTab?: DashboardTab;
  userInitials?: string;
}

export function DashboardContainer({ initialProjects, dashboardData, defaultTab, userInitials }: DashboardContainerProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>(defaultTab || 'overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'visual' | 'markdown'>('visual');
  const [keywordInput, setKeywordInput] = useState('');
  // Sin fixtures: la lista arranca vacía y KeywordsTab muestra su empty state.
  const [keywordsList, setKeywordsList] = useState<KeywordItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjects[0]?.id || '');
  const activeTabRef = useRef<DashboardTab>(activeTab);
  const projectRef = useRef<string>(selectedProjectId);
  // El copilot "escucha" mientras genera → la red neuronal acelera su pulso
  const [copilotGenerating, setCopilotGenerating] = useState(false);

  // AI Report state and actions live in the hook
  const aiReport = useAiReport(selectedProjectId);

  // Keyword management — P1-2: persiste en BD (keyword_targets) + GSC real
  const [gscTotals, setGscTotals] = useState<GscTotals>({ impressions: 0, clicks: 0, ctr: null, position: null, hasData: false });
  const [competitorsList, setCompetitorsList] = useState<CompetitorRow[]>([]);
  const [competitorInput, setCompetitorInput] = useState('');
  const [, setKeywordsLoading] = useState(false);
  // A-3: rol efectivo en el proyecto seleccionado (null = sin acceso).
  const [userRole, setUserRole] = useState<string | null>(null);
  const canEditKeywords = userRole === 'owner' || userRole === 'admin' || userRole === 'editor';

  const loadKeywords = useCallback(async (projectId: string) => {
    if (!projectId) {
      setKeywordsList([]);
      setCompetitorsList([]);
      setGscTotals({ impressions: 0, clicks: 0, ctr: null, position: null, hasData: false });
      setUserRole(null);
      return;
    }
    setKeywordsLoading(true);
    try {
      const result = await listKeywordData({ projectId });
      if (result.data?.keywords) {
        setUserRole(result.data.myRole);
        setKeywordsList(result.data.keywords.map((k) => ({
          id: k.id,
          keyword: k.keyword,
          project: k.projectName,
          volume: k.volume ?? '—',
          difficulty: k.difficulty,
          position: k.position,
          trend: 'stable' as const,
          change: '—',
        })));
        setGscTotals(result.data.gsc);
        setCompetitorsList(result.data.competitors);
      }
    } finally {
      setKeywordsLoading(false);
    }
  }, []);

  useEffect(() => {
    activeTabRef.current = activeTab;
    projectRef.current = selectedProjectId;
  });

  // Carga perezosa de keywords: solo al abrir la pestaña o cambiar de
  // proyecto estando en ella (P1-2). Sin useEffect con setState: eventos.
  const openTab = useCallback((tab: DashboardTab) => {
    setActiveTab(tab);
    if (tab === 'keywords') void loadKeywords(projectRef.current);
  }, [loadKeywords]);

  const pickProject = useCallback((id: string) => {
    setSelectedProjectId(id);
    projectRef.current = id;
    if (activeTabRef.current === 'keywords') void loadKeywords(id);
  }, [loadKeywords]);

  const handleAddKeyword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keywordInput.trim() || !selectedProjectId) return;
    const result = await addKeywordTarget({ projectId: selectedProjectId, keyword: keywordInput.trim() });
    if (result.data?.success) await loadKeywords(selectedProjectId);
    setKeywordInput('');
  };

  const handleDeleteKeyword = async (id: string) => {
    const result = await removeKeywordTarget({ id });
    if (result.data?.success && selectedProjectId) await loadKeywords(selectedProjectId);
  };

  const handleImportCsv = async (rows: Array<{ keyword: string; position?: number; date?: string }>) => {
    if (!selectedProjectId || rows.length === 0) return;
    const result = await importKeywordCsv({ projectId: selectedProjectId, rows });
    if (result.data?.success) await loadKeywords(selectedProjectId);
  };

  const handleAddCompetitor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!competitorInput.trim() || !selectedProjectId) return;
    const result = await addCompetitor({ projectId: selectedProjectId, domain: competitorInput.trim() });
    if (result.data?.success && selectedProjectId) await loadKeywords(selectedProjectId);
    setCompetitorInput('');
  };

  const handleDeleteCompetitor = async (id: string) => {
    const result = await removeCompetitor({ id });
    if (result.data?.success && selectedProjectId) await loadKeywords(selectedProjectId);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex relative overflow-hidden">
      {/* Red neuronal de fondo — z-0, pointer-events none, theme-aware. El
          micro-detalle "listening" se activa mientras el copilot genera. */}
      <NeuralNetworkBackground listening={copilotGenerating} />

      {/* Sidebar Component */}
      <DashboardSidebar
        activeTab={activeTab}
        onTabChange={openTab}
        projectCount={initialProjects.length}
      />

      {/* Mobile drawer — el sidebar es hidden en <md */}
      <MobileNav
        open={mobileNavOpen}
        activeTab={activeTab}
        onTabChange={openTab}
        onClose={() => setMobileNavOpen(false)}
      />

      {/* Main Content Area — bg transparente para dejar ver la red neuronal de fondo */}
      <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header Component */}
        <DashboardHeader 
          activeTab={activeTab} 
          NewProjectModal={NewProjectModal} 
          onMenu={() => setMobileNavOpen(true)}
          onNavigateProjects={() => openTab('projects')}
          userInitials={userInitials}
        />

        {/* Dynamic Content Panel */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-10 pb-28 sm:pb-32 bg-muted/30 relative z-10">
          <div key={activeTab} className="max-w-6xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {activeTab === 'overview' && (
              <OverviewTab 
                initialProjects={initialProjects} 
                dashboardData={dashboardData} 
                setActiveTab={(tab) => openTab(tab as DashboardTab)}
                projectId={selectedProjectId}
              />
            )}

            {activeTab === 'projects' && (
              <ProjectsTab 
                dashboardData={dashboardData} 
                NewProjectModal={NewProjectModal} 
              />
            )}

            {activeTab === 'performance' && (
              <PerformanceTab 
                dashboardData={dashboardData} 
              />
            )}

            {activeTab === 'keywords' && (
              <KeywordsTab 
                keywordsList={keywordsList}
                keywordInput={keywordInput}
                setKeywordInput={setKeywordInput}
                handleAddKeyword={handleAddKeyword}
                onDeleteKeyword={handleDeleteKeyword}
                gsc={gscTotals}
                competitors={competitorsList}
                competitorInput={competitorInput}
                setCompetitorInput={setCompetitorInput}
                onAddCompetitor={handleAddCompetitor}
                onDeleteCompetitor={handleDeleteCompetitor}
                canEdit={canEditKeywords}
                onImportCsv={handleImportCsv}
              />
            )}

            {activeTab === 'reports' && (
              <ReportsTab 
                initialProjects={initialProjects}
                selectedProjectId={selectedProjectId}
                setSelectedProjectId={pickProject}
                aiReport={aiReport}
                viewMode={viewMode}
                setViewMode={setViewMode}
                setActiveTab={(tab) => openTab(tab as DashboardTab)}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsTab 
                initialProjects={initialProjects}
                selectedProjectId={selectedProjectId}
                setSelectedProjectId={pickProject}
              />
            )}

            {activeTab === 'intelligence' && (
              <IntelligenceTab 
                initialProjects={initialProjects}
                selectedProjectId={selectedProjectId}
                setSelectedProjectId={pickProject}
              />
            )}

            {activeTab === 'monitoring' && (
              <MonitoringTab 
                initialProjects={initialProjects}
                selectedProjectId={selectedProjectId}
                setSelectedProjectId={pickProject}
              />
            )}

            {activeTab === 'adversary' && (
              <AdversaryTab
                projectId={selectedProjectId}
                initialProjects={initialProjects}
                setSelectedProjectId={pickProject}
              />
            )}

            {activeTab === 'plugins' && (
              <MarketplaceTab />
            )}

          </div>
        </div>
      </main>

      {/* Floating AI Copilot Widget */}
      <AiCopilot
        contextData={dashboardData}
        onGeneratingChange={setCopilotGenerating}
      />
    </div>
  );
}
