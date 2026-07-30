"use client";

import React, { useState, useEffect } from "react";
import { LayoutGrid, Eye, EyeOff, RotateCcw } from "lucide-react";

export interface WidgetConfig {
  id: string;
  title: string;
  enabled: boolean;
  order: number;
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "score_gauge", title: "Score Gauge & Drift Detection", enabled: true, order: 1 },
  { id: "attack_surface", title: "Attack Surface Graph", enabled: true, order: 2 },
  { id: "geo_map", title: "Interactive GeoIP Map", enabled: true, order: 3 },
  { id: "mitre_coverage", title: "MITRE ATT&CK Mapping", enabled: true, order: 4 },
  { id: "web_vitals", title: "Real User Monitoring (RUM)", enabled: true, order: 5 },
];

interface CustomDashboardGridProps {
  childrenMap: Record<string, React.ReactNode>;
}

export function CustomDashboardGrid({ childrenMap }: CustomDashboardGridProps) {
  const [widgets, setWidgets] = useState<WidgetConfig[]>(DEFAULT_WIDGETS);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("scaudit_dashboard_widgets");
    if (saved) {
      try {
        setWidgets(JSON.parse(saved));
      } catch {
        // Fallback to defaults if parsing fails
      }
    }
  }, []);

  const saveWidgetState = (newWidgets: WidgetConfig[]) => {
    setWidgets(newWidgets);
    localStorage.setItem("scaudit_dashboard_widgets", JSON.stringify(newWidgets));
  };

  const toggleWidget = (id: string) => {
    const updated = widgets.map((w) =>
      w.id === id ? { ...w, enabled: !w.enabled } : w
    );
    saveWidgetState(updated);
  };

  const resetLayout = () => {
    saveWidgetState(DEFAULT_WIDGETS);
  };

  const activeWidgets = [...widgets]
    .filter((w) => w.enabled)
    .sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-4">
      {/* Control Bar */}
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 shadow-md">
        <div className="flex items-center gap-2 text-slate-200 text-sm font-medium">
          <LayoutGrid className="w-4 h-4 text-indigo-400" />
          <span>Dashboard Configurable</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="text-xs font-medium text-slate-300 hover:text-indigo-400 bg-slate-800 hover:bg-slate-750 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
          >
            {isEditing ? "Finalizar Edición" : "Personalizar Layout"}
          </button>

          {isEditing && (
            <button
              onClick={resetLayout}
              className="text-xs text-slate-400 hover:text-rose-400 p-1.5 rounded-lg transition-colors"
              title="Restablecer layout original"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Editing Controls Drawer */}
      {isEditing && (
        <div className="bg-slate-900/90 backdrop-blur-sm border border-indigo-500/30 rounded-xl p-4 space-y-3">
          <p className="text-xs text-slate-400 uppercase font-semibold tracking-wider">
            Widgets Visibles
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {widgets.map((widget) => (
              <button
                key={widget.id}
                onClick={() => toggleWidget(widget.id)}
                className={`flex items-center justify-between p-2.5 rounded-lg border text-xs font-medium transition-all ${
                  widget.enabled
                    ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300"
                    : "bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700"
                }`}
              >
                <span>{widget.title}</span>
                {widget.enabled ? (
                  <Eye className="w-4 h-4 text-indigo-400" />
                ) : (
                  <EyeOff className="w-4 h-4 text-slate-600" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Render Grid Active Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {activeWidgets.map((w) => (
          <div key={w.id} className="w-full">
            {childrenMap[w.id] || (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center text-slate-500 text-sm">
                Widget `{w.title}` cargado.
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
