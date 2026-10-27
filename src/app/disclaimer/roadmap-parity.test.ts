import { describe, it, expect } from "vitest";
import es from "./es.json";
import en from "./en.json";

/** Aplanado tipo a.b.c — mismo criterio que scripts/i18n-parity.mjs. */
function flatten(obj: Record<string, unknown>, prefix = ""): Set<string> {
  const keys = new Set<string>();
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const key of flatten(v as Record<string, unknown>, path)) keys.add(key);
    } else {
      keys.add(path);
    }
  }
  return keys;
}

describe("disclaimer JSON — paridad roadmap es/en", () => {
  it("los dos locales exponen las MISMAS claves bajo disclaimer.roadmap", () => {
    const esKeys = flatten(es.disclaimer.roadmap);
    const enKeys = flatten(en.disclaimer.roadmap);
    expect([...esKeys].sort()).toEqual([...enKeys].sort());
  });

  it("cubre 4 grupos y 14 items", () => {
    expect(Object.keys(es.disclaimer.roadmap.groups)).toHaveLength(4);
    expect(Object.keys(es.disclaimer.roadmap.items)).toHaveLength(14);
  });
});

describe("disclaimer JSON — paridad del estado del producto es/en", () => {
  it("los dos locales exponen las MISMAS claves", () => {
    const esKeys = flatten(es.disclaimer.status);
    const enKeys = flatten(en.disclaimer.status);
    expect([...esKeys].sort()).toEqual([...enKeys].sort());
  });

  it("mantiene la misma longitud en las listas de resueltos y en implementación", () => {
    expect(es.disclaimer.status.resolved).toHaveLength(en.disclaimer.status.resolved.length);
    expect(es.disclaimer.status.inProgress).toHaveLength(en.disclaimer.status.inProgress.length);
  });
});
