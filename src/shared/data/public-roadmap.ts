/**
 * public-roadmap.ts — Fuente única de verdad de la hoja de ruta pública
 * (tarea 6.0 del plan Q4): fechas en ISO, textos vía i18n (titleKey).
 * El formato "día mes año" lo produce Intl.DateTimeFormat en el renderer —
 * aquí solo viven datos, nunca texto localizado.
 */

export type RoadmapGroupId = "perf" | "integrations" | "compliance" | "refinement";

export type RoadmapItem = {
  id: string;
  group: RoadmapGroupId;
  titleKey: string;
  /** ISO calendar date, or null when no current estimate is confirmed. */
  targetDate: string | null;
};

export const ROADMAP_GROUPS: Array<{ id: RoadmapGroupId; titleKey: string }> = [
  { id: "perf", titleKey: "roadmap.groups.perf" },
  { id: "integrations", titleKey: "roadmap.groups.integrations" },
  { id: "compliance", titleKey: "roadmap.groups.compliance" },
  { id: "refinement", titleKey: "roadmap.groups.refinement" },
];

export const PUBLIC_ROADMAP: RoadmapItem[] = [
  { id: "partitioning", group: "perf", titleKey: "roadmap.items.partitioning", targetDate: null },
  { id: "osint", group: "integrations", titleKey: "roadmap.items.osint", targetDate: "2026-11-06" },
  {
    id: "webhooks",
    group: "integrations",
    titleKey: "roadmap.items.webhooks",
    targetDate: "2026-11-11",
  },
  { id: "docx", group: "integrations", titleKey: "roadmap.items.docx", targetDate: "2026-11-13" },
  {
    id: "bgJobs",
    group: "integrations",
    titleKey: "roadmap.items.bgJobs",
    targetDate: "2026-11-16",
  },
  {
    id: "iso27001",
    group: "compliance",
    titleKey: "roadmap.items.iso27001",
    targetDate: "2026-11-21",
  },
  {
    id: "soc2pci",
    group: "compliance",
    titleKey: "roadmap.items.soc2pci",
    targetDate: "2026-11-28",
  },
  {
    id: "soc2prep",
    group: "compliance",
    titleKey: "roadmap.items.soc2prep",
    targetDate: "2026-12-14",
  },
  { id: "docs", group: "refinement", titleKey: "roadmap.items.docs", targetDate: "2026-12-17" },
  {
    id: "tutorials",
    group: "refinement",
    titleKey: "roadmap.items.tutorials",
    targetDate: "2026-12-22",
  },
  {
    id: "secReview",
    group: "refinement",
    titleKey: "roadmap.items.secReview",
    targetDate: "2026-12-28",
  },
];
