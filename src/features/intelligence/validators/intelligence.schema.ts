import { z } from "zod";

export const targetTypeSchema = z.enum(["domain", "hostname", "url", "ip", "email", "asn", "cidr"]);

export const createInvestigationSchema = z.object({
  projectId: z.string().uuid(),
  target: z.string().trim().min(3).max(512),
  template: z.enum(["auto", "domain", "email", "ip", "website", "attack_surface"]).default("auto"),
  tools: z.array(z.string()).max(40).optional(),
});

export const runToolSchema = z.object({
  investigationId: z.string().uuid().optional(),
  projectId: z.string().uuid(),
  toolId: z.string().min(2).max(80),
  input: z.record(z.string(), z.unknown()),
});
