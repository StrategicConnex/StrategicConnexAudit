import { describe, it, expect } from "vitest";
import {
  buildSemanticKey,
  getSemanticCache,
  setSemanticCache,
  ttlFor,
} from "./ai-cache";

const MSGS = [{ role: "user", content: "hola mundo" }] as const;

describe("ai-cache — caché semántica (P1-3)", () => {
  it("la clave depende de los mensajes completos, no solo del final", async () => {
    const a = buildSemanticKey("general-chat", "s", [
      { role: "user", content: "contexto distinto al inicio, misma cola final XXX" },
    ]);
    const b = buildSemanticKey("general-chat", "s", [
      { role: "user", content: "otro contexto totalmente diferente, misma cola final XXX" },
    ]);
    expect(a).not.toBe(b);
  });

  it("mismo input = misma clave (determinista)", () => {
    const a = buildSemanticKey("seo-report", "p1:2026-01-01", [...MSGS]);
    const b = buildSemanticKey("seo-report", "p1:2026-01-01", [...MSGS]);
    expect(a).toBe(b);
  });

  it("el scope separa proyectos/días", () => {
    const a = buildSemanticKey("seo-report", "p1:2026-01-01", [...MSGS]);
    const b = buildSemanticKey("seo-report", "p2:2026-01-01", [...MSGS]);
    expect(a).not.toBe(b);
  });

  it("set + get en memoria (sin Redis en test)", async () => {
    const key = buildSemanticKey("general-chat", "t1", [...MSGS]);
    expect(await getSemanticCache(key)).toBeNull();
    await setSemanticCache(key, "contenido", "modelo-x", "general-chat");
    expect(await getSemanticCache(key)).toEqual({ content: "contenido", modelId: "modelo-x" });
  });

  it("TTL: seo-report 24h, resto 1h", () => {
    expect(ttlFor("seo-report")).toBe(86400);
    expect(ttlFor("general-chat")).toBe(3600);
    expect(ttlFor("incident-brief")).toBe(3600);
  });
});
