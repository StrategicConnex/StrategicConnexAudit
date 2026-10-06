import { z } from "zod";

export const ProjectIdSchema = z.object({
  projectId: z.string().uuid(),
});

export const InvestigationSchema = z.object({
  projectId: z.string().uuid(),
  target: z.string().min(1).max(253),
  targetType: z.enum(["domain", "hostname", "url", "ip", "email", "asn", "cidr"]),
});

// ── Ciclo de vida del hallazgo (Tanda 2 / B1) ───────────────────────────────

export const FindingStatusSchema = z.enum([
  "open",
  "acknowledged",
  "in_progress",
  "resolved",
  "false_positive",
  "accepted_risk",
]);

export const FindingTransitionSchema = z.object({
  projectId: z.string().uuid(),
  toStatus: FindingStatusSchema,
  note: z.string().trim().max(500).optional(),
});

export const FindingSuppressSchema = z.object({
  projectId: z.string().uuid(),
  reason: z.string().trim().min(3).max(300),
  hours: z.coerce.number().int().min(1).max(24 * 90).default(24 * 7),
});

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Ventana de la vista de tendencias (B9). El rango se acota en el servidor:
 * sin tope, `audits` y `uptime_logs` de un proyecto con histórico largo se
 * escanean enteros para pintar la misma línea.
 */
export const TrendWindowSchema = z.enum(["day", "week", "month"]);

export const TrendsQuerySchema = z.object({
  projectId: z.string().uuid(),
  bucket: TrendWindowSchema.default("week"),
  window: z.coerce.number().int().min(1).max(52).default(12),
});

export const PurpleScoreQuerySchema = z.object({
  projectId: z.string().uuid(),
  days: z.coerce.number().int().min(7).max(365).default(90),
});
