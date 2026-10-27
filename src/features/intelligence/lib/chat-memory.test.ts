import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_CONTEXT_CHARS,
  MAX_CONTEXT_MESSAGES,
  buildIntelligenceMemoryKey,
  buildOutgoingHistory,
  clearIntelligenceMemory,
  loadIntelligenceMemory,
  saveIntelligenceMemory,
} from "./chat-memory";

const PROJECT_A = "11111111-1111-4111-8111-111111111111";
const PROJECT_B = "44444444-4444-4444-8444-444444444444";
const INVESTIGATION_A = "22222222-2222-4222-8222-222222222222";
const INVESTIGATION_B = "55555555-5555-4555-8555-555555555555";

function keyFor(projectId: string, investigationId?: string) {
  return buildIntelligenceMemoryKey({ mode: "analyst", projectId, investigationId });
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("memoria v2 · clave y aislamiento", () => {
  it("usa namespace/versión nuevos con modo y contexto activo", () => {
    expect(keyFor(PROJECT_A, INVESTIGATION_A)).toBe(
      `scaudit:chat:intelligence:v2:analyst:${INVESTIGATION_A}`,
    );
    expect(keyFor(PROJECT_A)).toBe(`scaudit:chat:intelligence:v2:analyst:${PROJECT_A}`);
    expect(buildIntelligenceMemoryKey({ mode: "analyst" })).toBe(
      "scaudit:chat:intelligence:v2:analyst:none",
    );
  });

  it("aísla conversaciones por investigación y por proyecto", () => {
    saveIntelligenceMemory(keyFor(PROJECT_A, INVESTIGATION_A), [
      { role: "user", content: "contexto A" },
    ]);
    saveIntelligenceMemory(keyFor(PROJECT_B, INVESTIGATION_B), [
      { role: "user", content: "contexto B" },
    ]);

    expect(loadIntelligenceMemory(keyFor(PROJECT_A, INVESTIGATION_A))).toEqual([
      { role: "user", content: "contexto A" },
    ]);
    expect(loadIntelligenceMemory(keyFor(PROJECT_B, INVESTIGATION_B))).toEqual([
      { role: "user", content: "contexto B" },
    ]);
    expect(loadIntelligenceMemory(keyFor(PROJECT_A))).toEqual([]);
  });

  it("no lee ni migra claves v1 y las deja intactas al guardar/borrar v2", () => {
    const legacyKey = "scaudit:chat:copilot";
    const legacy = JSON.stringify({
      v: 1,
      savedAt: Date.now(),
      messages: [{ role: "user", content: "legado" }],
    });
    window.localStorage.setItem(legacyKey, legacy);

    expect(loadIntelligenceMemory(keyFor(PROJECT_A))).toEqual([]);

    saveIntelligenceMemory(keyFor(PROJECT_A), [{ role: "user", content: "nuevo" }]);
    clearIntelligenceMemory(keyFor(PROJECT_A));

    expect(window.localStorage.getItem(legacyKey)).toBe(legacy);
    expect(window.localStorage.getItem("scaudit:chat:analyst")).toBeNull();
  });

  it("rechaza un envelope con versión distinta en la clave v2", () => {
    const key = keyFor(PROJECT_A);
    window.localStorage.setItem(
      key,
      JSON.stringify({ v: 1, savedAt: Date.now(), messages: [{ role: "user", content: "x" }] }),
    );
    expect(loadIntelligenceMemory(key)).toEqual([]);
  });
});

describe("memoria v2 · retención", () => {
  it("expira a los 7 días y borra la entrada vencida", () => {
    const key = keyFor(PROJECT_A);
    saveIntelligenceMemory(key, [{ role: "user", content: "ayer" }]);

    const envelope = JSON.parse(window.localStorage.getItem(key) as string) as {
      savedAt: number;
    };
    envelope.savedAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
    window.localStorage.setItem(key, JSON.stringify(envelope));

    expect(loadIntelligenceMemory(key)).toEqual([]);
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it("conserva como máximo 100 mensajes persistidos", () => {
    const key = keyFor(PROJECT_A);
    const messages = Array.from({ length: 120 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `m-${i}`,
    }));
    saveIntelligenceMemory(key, messages);

    const loaded = loadIntelligenceMemory(key);
    expect(loaded).toHaveLength(100);
    expect(loaded[0]?.content).toBe("m-20");
    expect(loaded.at(-1)?.content).toBe("m-119");
  });

  it("excluye errores, streams parciales y mensajes vacíos", () => {
    const key = keyFor(PROJECT_A);
    saveIntelligenceMemory(key, [
      { role: "user", content: "pregunta" },
      { role: "assistant", content: "fallo", isError: true },
      { role: "assistant", content: "parcial", isStreaming: true },
      { role: "assistant", content: "   " },
      { role: "assistant", content: "respuesta" },
    ]);

    expect(loadIntelligenceMemory(key)).toEqual([
      { role: "user", content: "pregunta" },
      { role: "assistant", content: "respuesta" },
    ]);
  });

  it("borra la clave si no hay ningún mensaje de usuario", () => {
    const key = keyFor(PROJECT_A);
    saveIntelligenceMemory(key, [
      { role: "assistant", content: "solo saludo" },
      { role: "assistant", content: "error", isError: true },
    ]);
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it("clear borra solo el contexto indicado", () => {
    const keyA = keyFor(PROJECT_A, INVESTIGATION_A);
    const keyB = keyFor(PROJECT_B, INVESTIGATION_B);
    saveIntelligenceMemory(keyA, [{ role: "user", content: "A" }]);
    saveIntelligenceMemory(keyB, [{ role: "user", content: "B" }]);

    clearIntelligenceMemory(keyA);

    expect(loadIntelligenceMemory(keyA)).toEqual([]);
    expect(loadIntelligenceMemory(keyB)).toEqual([
      { role: "user", content: "B" },
    ]);
  });
});

describe("memoria v2 · contexto saliente", () => {
  it("recorta a los 10 mensajes más recientes (FIFO)", () => {
    const messages = Array.from({ length: 12 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `m-${i}`,
    }));

    const outgoing = buildOutgoingHistory(messages);

    expect(outgoing).toHaveLength(MAX_CONTEXT_MESSAGES);
    expect(outgoing[0]?.content).toBe("m-2");
    expect(outgoing.at(-1)?.content).toBe("m-11");
  });

  it("recorta desde el más antiguo hasta 8.000 caracteres y preserva el más reciente", () => {
    const block = "x".repeat(3_000);
    const outgoing = buildOutgoingHistory([
      { role: "user", content: `a${block}` },
      { role: "assistant", content: `b${block}` },
      { role: "user", content: `c${block}` },
    ]);

    const total = outgoing.reduce((sum, m) => sum + m.content.length, 0);
    expect(total).toBe(MAX_CONTEXT_CHARS);
    expect(outgoing).toHaveLength(3);
    expect(outgoing[0]?.content).toHaveLength(MAX_CONTEXT_CHARS - 2 * (block.length + 1));
    expect(outgoing[0]?.content.startsWith("a")).toBe(true);
    expect(outgoing.at(-1)?.content).toBe(`c${block}`);
  });

  it("trunca un único mensaje que excede el presupuesto", () => {
    const outgoing = buildOutgoingHistory([
      { role: "user", content: "y".repeat(9_000) },
    ]);
    expect(outgoing).toHaveLength(1);
    expect(outgoing[0]?.content).toHaveLength(MAX_CONTEXT_CHARS);
  });

  it("aplica el scrubber compartido a la historia", () => {
    const jwt = "aaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbb.cccccccccccccccc";
    const outgoing = buildOutgoingHistory([
      {
        role: "user",
        content: `contacto ana@acme.com key sk-live-ABC1234567890 token ${jwt}`,
      },
    ]);

    const content = outgoing[0]?.content ?? "";
    expect(content).not.toContain("ana@acme.com");
    expect(content).not.toContain("sk-live-ABC1234567890");
    expect(content).not.toContain(jwt);
    expect(content).toContain("[EMAIL]");
    expect(content).toContain("[REDACTED]");
  });

  it("no envía errores ni parciales", () => {
    const outgoing = buildOutgoingHistory([
      { role: "user", content: "pregunta" },
      { role: "assistant", content: "fallo", isError: true },
      { role: "assistant", content: "parcial", isStreaming: true },
    ]);
    expect(outgoing).toEqual([{ role: "user", content: "pregunta" }]);
  });
});
