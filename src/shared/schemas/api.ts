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
