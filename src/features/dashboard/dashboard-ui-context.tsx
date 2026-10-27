"use client";

import { createContext, useContext } from "react";
import type { ProjectRow, ProjectWithNested } from "@/shared/db/types";
import type { DashboardTab } from "./DashboardSidebar";

/**
 * Datos de PÁGINA (queries con RLS) que el chrome fuera del `<Suspense>`
 * necesita pintar. Se publican desde `DashboardContainer` cuando los paneles
 * se hidratan: antes de eso el shell muestra placeholders honestos ("—").
 */
export interface DashboardChrome {
  initialProjects: ProjectRow[];
  dashboardData: ProjectWithNested[];
  /** Iniciales del usuario (header + saludo). Llega con la sesión. */
  userInitials?: string;
}

/** Telemetría del hero (fetch cliente de /api/intelligence/live + /api/ai/status). */
export interface DashboardLiveHero {
  uptimePercent: number | null;
  failedChecks: number;
  checksLoading: boolean;
}

export interface DashboardUIValue {
  /** Pestaña activa — vive en el shell (sidebar/header) y la leen los paneles. */
  activeTab: DashboardTab;
  setActiveTab: (tab: DashboardTab) => void;
  /** null = los paneles aún no hidrataron → placeholders en el chrome. */
  chrome: DashboardChrome | null;
  live: DashboardLiveHero | null;
  publishChrome: (chrome: DashboardChrome) => void;
  publishLive: (live: DashboardLiveHero) => void;
}

/**
 * Default con no-ops: `OverviewTab` se renderiza suelto en tests unitarios
 * sin provider y publicar no debe reventar ahí.
 */
const noop = () => {};

export const DashboardUIContext = createContext<DashboardUIValue>({
  activeTab: "overview",
  setActiveTab: noop,
  chrome: null,
  live: null,
  publishChrome: noop,
  publishLive: noop,
});

export function useDashboardUI(): DashboardUIValue {
  return useContext(DashboardUIContext);
}
