import { describe, expect, it } from "vitest";
import { parseChatCommand } from "./chat-commands";

const FINDING_ID = "33333333-3333-4333-8333-333333333333";

describe("parseChatCommand", () => {
  it("no intercepta texto normal", () => {
    expect(parseChatCommand("¿Qué debo priorizar?")).toBeNull();
    expect(parseChatCommand("   ")).toBeNull();
  });

  it("/help responde local, sin argumentos y case-insensitive", () => {
    expect(parseChatCommand("/help")).toEqual({ kind: "help" });
    expect(parseChatCommand("  /HELP  ")).toEqual({ kind: "help" });
    expect(parseChatCommand("/help finding")).toEqual({ kind: "help" });
  });

  it("/finding transporta solo un UUID válido", () => {
    expect(parseChatCommand(`/finding ${FINDING_ID}`)).toEqual({
      kind: "finding",
      findingId: FINDING_ID,
      argument: FINDING_ID,
    });
    expect(parseChatCommand(`/FINDING ${FINDING_ID.toUpperCase()}`)).toEqual({
      kind: "finding",
      findingId: FINDING_ID.toUpperCase(),
      argument: FINDING_ID.toUpperCase(),
    });
  });

  it("/finding sin ID o con ID malformado no produce un identificador utilizable", () => {
    expect(parseChatCommand("/finding")).toEqual({
      kind: "finding",
      findingId: null,
      argument: "",
    });
    expect(parseChatCommand("/finding no-es-uuid")).toEqual({
      kind: "finding",
      findingId: null,
      argument: "no-es-uuid",
    });
    expect(parseChatCommand(`/finding ${FINDING_ID.slice(0, -1)}`)).toMatchObject({
      kind: "finding",
      findingId: null,
    });
  });

  it("un slash desconocido se resuelve localmente con su nombre", () => {
    expect(parseChatCommand("/foo")).toEqual({ kind: "unknown", command: "/foo" });
    expect(parseChatCommand("/")).toEqual({ kind: "unknown", command: "/" });
    expect(parseChatCommand("/FOO bar")).toEqual({ kind: "unknown", command: "/FOO" });
  });

  it("no confunde rutas ni texto con prefijo slash", () => {
    expect(parseChatCommand("/api/ai/copilot")).toEqual({
      kind: "unknown",
      command: "/api/ai/copilot",
    });
    expect(parseChatCommand("ver /help")).toBeNull();
  });
});
