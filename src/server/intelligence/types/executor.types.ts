import { ToolCategory } from "../registry/tool-registry";

export type Severity = "info" | "low" | "medium" | "high" | "critical";

/**
 * Hallazgo normalizado generado por cualquier ejecutor de inteligencia.
 * Compatible con el esquema de persistencia Drizzle y el risk-engine.
 */
export interface Finding {
  /** ID del ejecutor que generó este hallazgo */
  toolId?: string;
  /** Categoría de la herramienta */
  category?: ToolCategory | string;
  /** Nivel de severidad determinístico */
  severity: Severity;
  /**
   * Nivel de confianza en el hallazgo (0.0 a 1.0).
   * Puede ser number o string coercible a number para compatibilidad
   * con valores serializados desde la base de datos.
   */
  confidence: number | string;
  /** Título conciso del hallazgo */
  title: string;
  /** Descripción técnica detallada */
  description: string;
  /** Recomendación de remediación (opcional) */
  recommendation?: string;
  /** Alias de recommendation para compatibilidad con tests y API */
  remediation?: string;
  /** Activo afectado (dominio, URL, IP) */
  affectedAsset?: string;
  /** Evidencia técnica estructurada */
  evidence?: Record<string, any>;
  /** Impacto numérico en el score de riesgo */
  scoreImpact?: number;
}

export interface ExecutionContext {
  projectId: string;
  investigationId?: string;
  userId?: string;
  signal?: AbortSignal;
  log: (message: string, payload?: Record<string, any>) => void;
}

export interface ExecutionResult<TOutput> {
  success: boolean;
  output: TOutput;
  findings: Finding[];
  error?: string;
}

export interface ToolExecutor<TInput = any, TOutput = any> {
  id: string;
  timeoutMs: number;
  category: ToolCategory;
  validate(input: unknown): TInput;
  execute(ctx: ExecutionContext, input: TInput): Promise<ExecutionResult<TOutput>>;
}
