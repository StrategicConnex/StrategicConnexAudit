import React from 'react';
import { Menu } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { InstallPwaButton } from './InstallPwaButton';
import { ThemeSwitcher } from "@/shared/design-system";

interface DashboardHeaderProps {
  activeTab: string;
  NewProjectModal: React.ComponentType<{ onCreated?: () => void }>;
  onMenu: () => void;
  onNavigateProjects: () => void;
}

const SUBTITLE_KEYS: Record<string, string> = {
  overview: 'header.overviewSubtitle',
  projects: 'header.projectsSubtitle',
  performance: 'header.performanceSubtitle',
  keywords: 'header.keywordsSubtitle',
  reports: 'header.reportsSubtitle',
  intelligence: 'header.intelligenceSubtitle',
  monitoring: 'header.monitoringSubtitle',
  adversary: 'header.adversarySubtitle',
  plugins: 'header.marketplaceSubtitle',
  settings: 'header.settingsSubtitle',
};

const TITLE_KEYS: Record<string, string> = {
  overview: 'header.overviewTitle',
  projects: 'tabs.projects',
  performance: 'tabs.performance',
  keywords: 'tabs.keywords',
  reports: 'tabs.reports',
  intelligence: 'tabs.intelligence',
  monitoring: 'tabs.monitoring',
  adversary: 'tabs.adversary',
  plugins: 'tabs.marketplace',
  settings: 'tabs.settings',
};

export function DashboardHeader({ activeTab, NewProjectModal, onMenu, onNavigateProjects }: DashboardHeaderProps) {
  const t = useTranslations('sidebar');
  const getTitle = () => t(TITLE_KEYS[activeTab] ?? 'header.overviewTitle');

  const getSubtitle = () => t(SUBTITLE_KEYS[activeTab] ?? 'header.overviewSubtitle');

  return (
    <header className="h-14 bg-background/60 backdrop-blur-xl border-b border-border/50 flex items-center justify-between px-3 sm:px-10 sticky top-0 z-20 shrink-0">
      <div className="flex items-center gap-2">
        <button
          onClick={onMenu}
          aria-label={t('menu')}
          className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg text-muted-fg hover:text-foreground hover:bg-muted/40 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div key={activeTab} className="flex flex-col animate-in fade-in slide-in-from-bottom-1 duration-300">
        <h1 className="text-lg font-bold tracking-tight text-foreground">
          {getTitle()}
        </h1>
        <p className="hidden sm:block text-2xs font-extrabold text-primary uppercase tracking-widest mt-0.5">
          {getSubtitle()}
        </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-6">
        <InstallPwaButton />
        <ThemeSwitcher compact />
        <NewProjectModal onCreated={onNavigateProjects} />
        <div className="hidden sm:flex w-9 h-9 rounded-full bg-muted/20 hover:bg-muted/40 items-center justify-center cursor-pointer transition-colors duration-300 border border-border/40 relative group">
          <span className="text-xs font-bold text-foreground/80 group-hover:text-foreground transition-colors">JU</span>
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-chartreuse border-2 border-background rounded-full" />
        </div>
      </div>
    </header>
  );
}
