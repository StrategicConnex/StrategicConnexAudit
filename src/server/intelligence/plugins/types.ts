/**
 * types.ts — Plugin Marketplace Types (P3.4)
 */

import type { PluginPackage, PluginInstance } from "@/shared/db/schemas";

// ─── Estado de un plugin en el marketplace ──────────────────────────────────

export interface PluginMarketplaceItem {
  /** Datos del paquete desde plugin_packages */
  pkg: PluginPackage;
  /** Datos de la instancia instalada (null si no está instalado) */
  instance: PluginInstance | null;
  /** Si el usuario actual lo tiene instalado */
  installed: boolean;
  /** Si el plugin es compatible con la versión actual de SCAUDIT */
  compatible: boolean;
}

// ─── Manifest de plugin (formato de importación) ────────────────────────────

export interface PluginManifest {
  name: string;
  version: string;
  author: string;
  description: string;
  longDescription?: string;
  iconUrl?: string;
  category: string;
  tags?: string[];
  homepage?: string;
  license?: string;
  minAppVersion?: string;
  dependencies?: Record<string, string>;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  permissions?: string[];
  riskLevel: "passive" | "active-safe" | "active-intrusive";
  isOfficial?: boolean;
}

// ─── Resultado de instalación ───────────────────────────────────────────────

export interface PluginInstallResult {
  success: boolean;
  instance: PluginInstance | null;
  error?: string;
}
