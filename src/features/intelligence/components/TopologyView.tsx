"use client";

import React from "react";
import { Activity } from "lucide-react";
import { AttackSurfaceGraph } from "./AttackSurfaceGraph";

interface TopologyViewProps {
  projectId: string;
}

export function TopologyView({ projectId }: TopologyViewProps) {
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-muted-fg" />
          <span className="text-xs text-muted-fg font-mono">
            Mapa Topológico de Superficie de Ataque
          </span>
        </div>
      </div>
      <div className="p-4 bg-card border border-border rounded-xl">
        <AttackSurfaceGraph projectId={projectId} />
      </div>
    </div>
  );
}
