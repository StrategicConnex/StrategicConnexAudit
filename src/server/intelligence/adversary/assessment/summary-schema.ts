/**
 * summary-schema.ts — Schema del resumen ejecutivo del informe adversario.
 * Aislado para poder importarse sin arrastrar el pipeline completo.
 */

import { z } from "zod";

export const executiveSummarySchema = z.object({
  summary: z.string().min(50),
  riskScore: z.number().int().min(0).max(100),
  topActions: z.array(z.string()).min(1).max(5),
});

export type ExecutiveSummary = z.infer<typeof executiveSummarySchema>;
