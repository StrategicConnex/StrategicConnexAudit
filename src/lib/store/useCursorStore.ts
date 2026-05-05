import { create } from "zustand";

interface CursorState {
  isHovering: boolean;
  setHovering: (val: boolean) => void;
}

export const useCursorStore = create<CursorState>((set) => ({
  isHovering: false,
  setHovering: (val: boolean) => set({ isHovering: val }),
}));
