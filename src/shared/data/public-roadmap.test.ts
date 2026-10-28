import { describe, it, expect } from "vitest";
import { PUBLIC_ROADMAP, ROADMAP_GROUPS } from "./public-roadmap";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

describe("public-roadmap — invariantes de datos", () => {
  it("declara los 11 items pendientes del plan Q4", () => {
    expect(PUBLIC_ROADMAP).toHaveLength(11);
    expect(PUBLIC_ROADMAP.map((i) => i.id)).toEqual([
      "partitioning",
      "osint",
      "webhooks",
      "docx",
      "bgJobs",
      "iso27001",
      "soc2pci",
      "soc2prep",
      "docs",
      "tutorials",
      "secReview",
    ]);
  });

  it("ids únicos y fechas ISO válidas o sin fecha confirmada", () => {
    const ids = new Set(PUBLIC_ROADMAP.map((i) => i.id));
    expect(ids.size).toBe(PUBLIC_ROADMAP.length);
    for (const item of PUBLIC_ROADMAP) {
      if (item.targetDate === null) continue;
      expect(ISO_DATE.test(item.targetDate), item.id).toBe(true);
      expect(Number.isNaN(new Date(item.targetDate).getTime()), item.id).toBe(false);
    }
    expect(PUBLIC_ROADMAP.find((item) => item.id === "partitioning")?.targetDate).toBeNull();
  });

  it("cada item pertenece a un grupo válido con titleKey <group>.<id> e item <id>", () => {
    const groupIds = new Set(ROADMAP_GROUPS.map((g) => g.id));
    for (const item of PUBLIC_ROADMAP) {
      expect(groupIds.has(item.group), item.id).toBe(true);
      expect(item.titleKey).toBe(`roadmap.items.${item.id}`);
    }
  });

  it("grupos en orden editorial y titleKeys únicos", () => {
    expect(ROADMAP_GROUPS.map((g) => g.id)).toEqual([
      "perf",
      "integrations",
      "compliance",
      "refinement",
    ]);
    const keys = new Set(ROADMAP_GROUPS.map((g) => g.titleKey));
    expect(keys.size).toBe(ROADMAP_GROUPS.length);
  });
});
