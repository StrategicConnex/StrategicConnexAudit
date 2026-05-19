import { create } from "zustand";

export interface IntelligenceState {
  activeInvestigationId: string | null;
  aiSidebarOpen: boolean;
  selectedToolId: string | null;
  selectedEvidenceId: string | null;
  setActiveInvestigation: (id: string | null) => void;
  toggleAiSidebar: () => void;
  selectTool: (id: string | null) => void;
  selectEvidence: (id: string | null) => void;
}

export const useIntelligenceStore = create<IntelligenceState>()((set) => ({
  activeInvestigationId: null,
  aiSidebarOpen: true,
  selectedToolId: null,
  selectedEvidenceId: null,
  setActiveInvestigation: (id: string | null) => set({ activeInvestigationId: id }),
  toggleAiSidebar: () => set((state) => ({ aiSidebarOpen: !state.aiSidebarOpen })),
  selectTool: (id: string | null) => set({ selectedToolId: id }),
  selectEvidence: (id: string | null) => set({ selectedEvidenceId: id }),
}));
