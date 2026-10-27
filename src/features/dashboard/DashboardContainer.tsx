'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { DashboardTab } from './DashboardSidebar';
import { useDashboardUI } from './dashboard-ui-context';
import { OverviewTab } from './tabs/OverviewTab';
import { TabSkeleton } from './TabSkeleton';
import { loadIntelligenceTab, loadPortfolioTab, loadTriageTab } from './tab-loaders';
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

const TriageTab = dynamic(loadTriageTab, {
  loading: () => <TabSkeleton />,
});

const PortfolioTab = dynamic(loadPortfolioTab, {
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

import { ProjectWithNested, type ProjectRow } from '@/shared/db/types';

interface DashboardContainerProps {
  initialProjects: ProjectRow[];
  dashboardData: ProjectWithNested[];
  /** Iniciales de la sesión — solo se publican al chrome (hero/header). */
  userInitials?: string;
}

export function DashboardContainer({ initialProjects, dashboardData, userInitials }: DashboardContainerProps) {
  // F-C (H-10b): la pestaña activa vive en el DashboardShell (chrome fuera
  // del Suspense) — el sidebar y la paleta la cambian y ESTOS paneles la
  // leen del contexto.
  const { activeTab, setActiveTab: openTab, publishChrome } = useDashboardUI();
  const [viewMode, setViewMode] = useState<'visual' | 'markdown'>('visual');
  const [keywordInput, setKeywordInput] = useState('');
  // Sin fixtures: la lista arranca vacía y KeywordsTab muestra su empty state.
  const [keywordsList, setKeywordsList] = useState<KeywordItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjects[0]?.id || '');
  const activeTabRef = useRef<DashboardTab>(activeTab);
  const projectRef = useRef<string>(selectedProjectId);

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

  // F-C (H-10b): el chrome (hero/sidebar/header/paleta) vive fuera del
  // Suspense y pinta con placeholders hasta que ESTOS paneles hidratan.
  // Publicar aquí los datos de página los rellena in place: mismo nodo y
  // mismas alturas → sin CLS y sin refrescar la página.
  useEffect(() => {
    publishChrome({ initialProjects, dashboardData, userInitials });
  }, [publishChrome, initialProjects, dashboardData, userInitials]);

  // Carga perezosa de keywords: solo al abrir la pestaña o cambiar de
  // proyecto estando en ella (P1-2). El disparo vive en un efecto sobre
  // `activeTab` porque la pestaña ahora puede cambiarse desde el chrome
  // (sidebar, paleta ⌘K) por fuera de este componente: quien pulse
  // "Keywords" ahí debe cargar exactamente lo mismo que quien lo hace
  // desde el menú interno.
  useEffect(() => {
    if (activeTab === 'keywords') void loadKeywords(projectRef.current);
  }, [activeTab, loadKeywords]);

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

  // Los paneles viven dentro del <Suspense> del DashboardShell: este div es
  // lo único que renderiza el contenedor (el chrome lo pinta el shell).
  return (
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
                onNavigateToIntelligence={() => openTab('intelligence')}
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

            {activeTab === 'portfolio' && (
              <PortfolioTab
                projects={initialProjects}
                selectedProjectId={selectedProjectId}
                setSelectedProjectId={pickProject}
              />
            )}

            {activeTab === 'triage' && (
              <TriageTab
                initialProjects={initialProjects}
                selectedProjectId={selectedProjectId}
                setSelectedProjectId={pickProject}
              />
            )}

    </div>
  );
}
