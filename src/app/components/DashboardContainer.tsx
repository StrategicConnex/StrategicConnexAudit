'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { DashboardSidebar, type DashboardTab } from './DashboardSidebar';
import { DashboardHeader } from './DashboardHeader';
import { OverviewTab } from './tabs/OverviewTab';
import { ProjectsTab } from './tabs/ProjectsTab';
import { PerformanceTab } from './tabs/PerformanceTab';
import { KeywordsTab, type KeywordItem } from './tabs/KeywordsTab';
import { ReportsTab } from './tabs/ReportsTab';
import { SettingsTab } from './tabs/SettingsTab';
import { IntelligenceTab } from './tabs/IntelligenceTab';
import { MonitoringTab } from './tabs/MonitoringTab';
import { useAiReport } from './useAiReport';

const NewProjectModal = dynamic(() => import('./NewProjectModal').then(mod => mod.NewProjectModal), {
  loading: () => <div className="w-9 h-9 bg-white/5 rounded-lg animate-pulse" />,
});

const AiCopilot = dynamic(() => import('./AiCopilot').then(mod => mod.AiCopilot), { ssr: false });

import { projects } from '@/shared/db/schemas';

type ProjectWithNested = typeof projects.$inferSelect & {
  latestAudit?: {
    id: string;
    status: string;
  } | null;
  integrations?: unknown[] | null;
};

interface DashboardContainerProps {
  initialProjects: (typeof projects.$inferSelect)[];
  dashboardData: ProjectWithNested[];
  defaultTab?: DashboardTab;
}

export function DashboardContainer({ initialProjects, dashboardData, defaultTab }: DashboardContainerProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>(defaultTab || 'overview');
  const [viewMode, setViewMode] = useState<'visual' | 'markdown'>('visual');
  const [keywordInput, setKeywordInput] = useState('');
  const [keywordsList, setKeywordsList] = useState<KeywordItem[]>([
    { id: '1', keyword: 'auditoria seo tecnica', volume: '1.2K', difficulty: 34, position: 3, change: '+2', trend: 'up', project: 'StrategicAudit Pro' },
    { id: '2', keyword: 'consultor seo enterprise', volume: '880', difficulty: 48, position: 1, change: '0', trend: 'stable', project: 'StrategicAudit Pro' },
    { id: '3', keyword: 'agencia de seo organico', volume: '2.4K', difficulty: 62, position: 12, change: '-3', trend: 'down', project: 'Silo SEO' },
    { id: '4', keyword: 'seo core web vitals', volume: '450', difficulty: 29, position: 5, change: '+8', trend: 'up', project: 'StrategicAudit Pro' },
    { id: '5', keyword: 'optimizacion pagespeed nextjs', volume: '320', difficulty: 15, position: 2, change: '+1', trend: 'up', project: 'Vercel App' },
  ]);
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjects[0]?.id || '');

  // AI Report state and actions live in the hook
  const aiReport = useAiReport(selectedProjectId);

  // Keyword management
  const handleAddKeyword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keywordInput.trim()) return;
    const newKw: KeywordItem = {
      id: Date.now().toString(),
      keyword: keywordInput.toLowerCase().trim(),
      volume: 'N/A',
      difficulty: 0,
      position: 0,
      change: 'New',
      trend: 'stable',
      project: dashboardData[0]?.name || 'Proyectos Generales',
    };
    setKeywordsList([newKw, ...keywordsList]);
    setKeywordInput('');
  };

  return (
    <div className="min-h-screen bg-background text-apple-ink flex">
      {/* Sidebar Component */}
      <DashboardSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        projectCount={initialProjects.length}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
        {/* Header Component */}
        <DashboardHeader 
          activeTab={activeTab} 
          NewProjectModal={NewProjectModal} 
        />

        {/* Dynamic Content Panel */}
        <div className="flex-1 overflow-y-auto p-10 bg-apple-gray/30">
          <div className="max-w-6xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            
            {activeTab === 'overview' && (
              <OverviewTab 
                initialProjects={initialProjects} 
                dashboardData={dashboardData} 
                setActiveTab={(tab) => setActiveTab(tab as DashboardTab)} 
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
              />
            )}

            {activeTab === 'reports' && (
              <ReportsTab 
                initialProjects={initialProjects}
                selectedProjectId={selectedProjectId}
                setSelectedProjectId={setSelectedProjectId}
                aiReport={aiReport}
                viewMode={viewMode}
                setViewMode={setViewMode}
                setActiveTab={(tab) => setActiveTab(tab as DashboardTab)}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsTab />
            )}

            {activeTab === 'intelligence' && (
              <IntelligenceTab 
                initialProjects={initialProjects}
                selectedProjectId={selectedProjectId}
                setSelectedProjectId={setSelectedProjectId}
              />
            )}

            {activeTab === 'monitoring' && (
              <MonitoringTab 
                initialProjects={initialProjects}
                selectedProjectId={selectedProjectId}
                setSelectedProjectId={setSelectedProjectId}
              />
            )}

          </div>
        </div>
      </main>

      {/* Floating AI Copilot Widget */}
      <AiCopilot contextData={dashboardData} />
    </div>
  );
}
