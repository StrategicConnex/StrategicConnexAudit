/**
 * tool-registry.ts — Tool Types ONLY (C05)
 *
 * Since the C05 consolidation, the runtime registry lives in
 * `core/tool-registry.ts` (NATIVE_TOOLS pairs, registerTool, stores).
 * This file intentionally keeps ONLY the shared type contracts so that
 * `executor.types.ts`, `policy-enforcer.ts` and `plugin-executor.ts`
 * can import them without creating import cycles.
 */

import { z } from "zod";

export type ToolCategory =
  | "dns"
  | "network"
  | "email-security"
  | "website"
  | "ssl-tls"
  | "threat"
  | "osint"
  | "ai";

export type ToolRisk = "passive" | "active-safe" | "active-intrusive";

export interface IntelligenceToolDefinition<TInput extends z.ZodTypeAny = z.ZodTypeAny> {
  id: string;
  name: string;
  category: ToolCategory;
  description: string;
  inputSchema: TInput;
  requiredPlan: "free" | "pro" | "business" | "enterprise";
  risk: ToolRisk;
  costUnits: number;
  cacheTtlSeconds: number;
  timeoutMs: number;
  executor: string;
}
