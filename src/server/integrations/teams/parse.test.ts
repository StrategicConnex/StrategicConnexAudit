import { describe, it, expect } from "vitest";
import { stripTeamsMentions } from "./parse";
import { parseCommandText } from "@/server/integrations/commands/commands";

describe("stripTeamsMentions", () => {
  it("quita la mención al bot y deja el comando", () => {
    expect(stripTeamsMentions("<at>SCAudit</at> status 550e8400")).toBe("status 550e8400");
  });

  it("quita entidades HTML", () => {
    expect(stripTeamsMentions("ack&nbsp;f-1")).toBe("ack f-1");
    expect(stripTeamsMentions("status p1 &amp; p2")).toBe("status p1 & p2");
  });

  it("colapsa espacios y recorta", () => {
    expect(stripTeamsMentions("  <at>Bot</at>   help  ")).toBe("help");
  });

  it("texto vacío o undefined → cadena vacía", () => {
    expect(stripTeamsMentions("")).toBe("");
    expect(stripTeamsMentions(undefined as unknown as string)).toBe("");
  });

  it("integra con el parser: un mensaje de Teams produce el comando esperado", () => {
    const parsed = parseCommandText(stripTeamsMentions("<at>SCAudit</at> ack&nbsp;f-9"));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.command).toMatchObject({ name: "ack", args: ["f-9"] });
  });
});
