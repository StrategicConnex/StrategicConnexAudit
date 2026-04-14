"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

interface CursorContextType {
  isHovering: boolean;
  onEnter: () => void;
  onLeave: () => void;
}

const CursorContext = createContext<CursorContextType | undefined>(undefined);

export function CursorProvider({ children }: { children: ReactNode }) {
  const [isHovering, setIsHovering] = useState(false);

  const onEnter = () => setIsHovering(true);
  const onLeave = () => setIsHovering(false);

  return (
    <CursorContext.Provider value={{ isHovering, onEnter, onLeave }}>
      {children}
    </CursorContext.Provider>
  );
}

export function useCursor() {
  const context = useContext(CursorContext);
  if (context === undefined) {
    throw new Error("useCursor must be used within a CursorProvider");
  }
  return context;
}
