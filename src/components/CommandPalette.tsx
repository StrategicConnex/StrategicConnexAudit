'use client';

import { useMemo, useState } from 'react';
import { focusRing } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  LayoutDashboard, Globe, Activity, Search, BarChart3, ShieldCheck,
  Sliders, Skull, Package, Settings, Plus, BookOpen, FolderGit2,
} from 'lucide-react';
import {
  Dialog,
  DialogPortal,
  DialogBackdrop,
  DialogPopup,
} from '@/components/ui/Dialog';
import { useCommandPalette } from '@/hooks/useCommandPalette';
import type { DashboardTab } from '@/features/dashboard/DashboardSidebar';
import { cn } from '@/lib/utils';

/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT CommandPalette — búsqueda global de comandos (spec §4.3/§4.4).
   Apertura vía contrato `scaudit:open-palette` (trigger + ⌘K/Ctrl+K del
   header). Búsqueda por texto, navegación por teclado (↑↓/Enter/Escape)
   y resultados agrupados por categoría. Semana 4 rediseño.
   ═══════════════════════════════════════════════════════════════════════ */

export interface PaletteProject {
  id: string;
  name: string;
  domain: string;
}

type Category = 'nav' | 'projects' | 'actions' | 'help';

interface PaletteCommand {
  id: string;
  category: Category;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

interface CommandPaletteProps {
  projects: PaletteProject[];
  onNavigateTab: (tab: DashboardTab) => void;
}

const TAB_META: { tab: DashboardTab; icon: React.ReactNode; labelKey: string }[] = [
  { tab: 'overview', icon: <LayoutDashboard size={16} />, labelKey: 'tabs.overview' },
  { tab: 'projects', icon: <Globe size={16} />, labelKey: 'tabs.projects' },
  { tab: 'performance', icon: <Activity size={16} />, labelKey: 'tabs.performance' },
  { tab: 'keywords', icon: <Search size={16} />, labelKey: 'tabs.keywords' },
  { tab: 'reports', icon: <BarChart3 size={16} />, labelKey: 'tabs.reports' },
  { tab: 'intelligence', icon: <ShieldCheck size={16} />, labelKey: 'tabs.intelligence' },
  { tab: 'monitoring', icon: <Sliders size={16} />, labelKey: 'tabs.monitoring' },
  { tab: 'adversary', icon: <Skull size={16} />, labelKey: 'tabs.adversary' },
  { tab: 'plugins', icon: <Package size={16} />, labelKey: 'tabs.marketplace' },
  { tab: 'settings', icon: <Settings size={16} />, labelKey: 'tabs.settings' },
];

const CATEGORY_ORDER: Category[] = ['nav', 'projects', 'actions', 'help'];

function normalize(s: string) {
  return s.toLowerCase().trim();
}

export function CommandPalette({ projects, onNavigateTab }: CommandPaletteProps) {
  const t = useTranslations('sidebar');
  const router = useRouter();
  const { open, setOpen, close } = useCommandPalette();
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  const runAndClose = (run: () => void) => {
    run();
    setQuery('');
    setHighlight(0);
    close();
  };

  const groups = useMemo(() => {
    const q = normalize(query);
    const match = (text: string) => q === '' || normalize(text).includes(q);

    const nav: PaletteCommand[] = TAB_META.filter((m) =>
      match(t(m.labelKey)),
    ).map((m) => ({
      id: `tab-${m.tab}`,
      category: 'nav' as const,
      label: t(m.labelKey),
      icon: m.icon,
      run: () => onNavigateTab(m.tab),
    }));

    const projectCommands: PaletteCommand[] = projects
      .filter((p) => match(`${p.name} ${p.domain}`))
      .slice(0, 8)
      .map((p) => ({
        id: `project-${p.id}`,
        category: 'projects' as const,
        label: p.name,
        hint: p.domain,
        icon: <FolderGit2 size={16} />,
        run: () => router.push(`/projects/${p.id}`),
      }));

    const actions: PaletteCommand[] = [
      {
        id: 'action-new-project',
        category: 'actions' as const,
        label: t('palette.newProject'),
        icon: <Plus size={16} />,
        run: () => onNavigateTab('projects'),
      },
    ].filter((a) => match(a.label));

    const help: PaletteCommand[] = [
      {
        id: 'help-docs',
        category: 'help' as const,
        label: t('palette.docs'),
        icon: <BookOpen size={16} />,
        run: () => window.open('/docs', '_blank', 'noopener'),
      },
    ].filter((a) => match(a.label));

    return CATEGORY_ORDER.map((category) => ({
      category,
      title: t(`palette.${category}`),
      items:
        category === 'nav'
          ? nav
          : category === 'projects'
            ? projectCommands
            : category === 'actions'
              ? actions
              : help,
    })).filter((g) => g.items.length > 0);
  }, [query, projects, onNavigateTab, router, t]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const activeId = flat[highlight] ? `palette-option-${flat[highlight].id}` : undefined;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (flat.length === 0 ? 0 : (h + 1) % flat.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) =>
        flat.length === 0 ? 0 : (h - 1 + flat.length) % flat.length,
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = flat[highlight];
      if (cmd) runAndClose(cmd.run);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setOpen(true);
        else {
          setQuery('');
          setHighlight(0);
          close();
        }
      }}
    >
      <DialogPortal>
        <DialogBackdrop />
        <DialogPopup
          aria-label={t('header.openPalette')}
          className="left-[6%] right-[6%] top-[10%] max-w-2xl translate-x-0 translate-y-0 p-2 sm:left-[10%] sm:right-[10%]"
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <Search size={16} className="shrink-0 text-muted-fg" />
            <input
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls="palette-listbox"
              aria-activedescendant={activeId}
              aria-label={t('header.searchPlaceholder')}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={t('header.searchPlaceholder')}
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-fg/60 focus:outline-none"
            />
            <kbd className="shrink-0 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-2xs font-bold text-muted-fg">
              ESC
            </kbd>
          </div>
          <div
            id="palette-listbox"
            role="listbox"
            aria-label={t('header.searchPlaceholder')}
            className="max-h-[40vh] overflow-y-auto p-1.5"
          >
            {flat.length === 0 && (
              <p className="px-3 py-8 text-center text-xs text-muted-fg">
                {t('palette.noResults')}
              </p>
            )}
            {groups.map((g) => (
              <div key={g.category} role="group" aria-label={g.title}>
                <p className="px-3 pt-2 pb-1 text-2xs font-extrabold uppercase tracking-widest text-muted-fg/60">
                  {g.title}
                </p>
                {g.items.map((cmd) => {
                  const index = flat.indexOf(cmd);
                  const selected = index === highlight;
                  return (
                    <button
                      key={cmd.id}
                      id={`palette-option-${cmd.id}`}
                      role="option"
                      aria-selected={selected}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => runAndClose(cmd.run)}
                      className={cn(
                        'flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold outline-none transition-colors',
                        focusRing,
                        selected
                          ? 'bg-primary/10 text-foreground'
                          : 'text-muted-fg',
                      )}
                    >
                      <span className={selected ? 'text-primary' : ''}>
                        {cmd.icon}
                      </span>
                      <span className="flex-1 truncate">{cmd.label}</span>
                      {cmd.hint && (
                        <span className="truncate text-2xs text-muted-fg/70">
                          {cmd.hint}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}
