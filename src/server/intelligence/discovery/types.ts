/**
 * discovery/types.ts — Tipos compartidos para el motor de Descubrimiento Continuo de Activos
 *
 * Diferencia de los tipos de ejecutor estándar:
 * - Los discovery modules son PROACTIVOS (buscan activos NO conocidos previamente)
 * - No están atados a una investigation específica (corren en background)
 * - Detectan cambios entre ejecuciones (asset_changes)
 */

import type { Finding } from "../types/executor.types";

// ─── Asset Discovery Result ───────────────────────────────────────────────────

export interface DiscoveredAsset {
  /** Tipo de activo: subdomain, ip, certificate, cloud_bucket, etc. */
  assetType: string;
  /** Valor del activo (ej: "admin.ejemplo.com") */
  value: string;
  /** IP asociada si aplica */
  ip: string | null;
  /** Metadatos adicionales específicos del tipo de activo */
  metadata: Record<string, unknown>;
  /** Severidad estimada del hallazgo (para shadow IT) */
  severity?: "info" | "low" | "medium" | "high" | "critical";
  /** Descripción de por qué este activo es relevante */
  description?: string;
}

export interface DiscoveryModuleResult {
  /** Identificador del módulo (ej: "dns-brute", "ct-monitor") */
  moduleId: string;
  /** Nombre legible del módulo */
  moduleName: string;
  /** Activos descubiertos en esta ejecución */
  assets: DiscoveredAsset[];
  /** Hallazgos de seguridad relacionados */
  findings: Finding[];
  /** Si el módulo se ejecutó exitosamente */
  success: boolean;
  /** Mensaje de error si falló */
  error?: string;
  /** Duración de la ejecución en ms */
  durationMs: number;
}

export interface DiscoveryRunResult {
  /** Dominio objetivo del descubrimiento */
  domain: string;
  /** ID del proyecto asociado */
  projectId: string;
  /** Resultados por módulo */
  modules: DiscoveryModuleResult[];
  /** Timestamp de la ejecución */
  timestamp: string;
  /** Total de activos nuevos encontrados */
  totalNewAssets: number;
  /** Total de cambios detectados vs ejecución anterior */
  totalChanges: number;
}

// ─── Asset Change Tracking ────────────────────────────────────────────────────

export interface AssetChange {
  projectId: string;
  domain: string;
  assetType: string;
  value: string;
  changeType: "new" | "removed" | "changed" | "reappeared";
  previousValue: string | null;
  currentValue: string | null;
  metadata: Record<string, unknown>;
  detectedAt: Date;
}

// ─── Configuración del Discovery ──────────────────────────────────────────────

export interface DiscoveryConfig {
  /** Dominio a escanear */
  domain: string;
  /** ID del proyecto */
  projectId: string;
  /** Timeout total para el discovery (default: 120s) */
  timeoutMs?: number;
  /** Habilitar DNS brute force */
  dnsBruteForce?: boolean;
  /** Habilitar CT log monitoring */
  ctMonitor?: boolean;
  /** Habilitar shadow asset detection */
  shadowDetection?: boolean;
  /** Lista de subdominios a excluir */
  excludeSubdomains?: string[];
}
