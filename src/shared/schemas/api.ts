import { z } from "zod";

export const ProjectIdSchema = z.object({
  projectId: z.string().uuid(),
});

export const InvestigationSchema = z.object({
  projectId: z.string().uuid(),
  target: z.string().min(1).max(253),
  targetType: z.enum(["domain", "hostname", "url", "ip", "email", "asn", "cidr"]),
});

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
