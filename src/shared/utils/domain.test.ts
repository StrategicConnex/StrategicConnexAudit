import { describe, it, expect } from "vitest";
import { normalizeDomain } from "./domain";

describe("domain — normalizeDomain (P1-2)", () => {
  it("quita protocolo, www y ruta", () => {
    expect(normalizeDomain("https://www.rival.com/blog/articulo")).toBe("rival.com");
  });

  it("minúsculas y sin espacios", () => {
    expect(normalizeDomain("  HTTP://RIVAL.COM ")).toBe("rival.com");
  });

  it("deja dominio limpio intacto", () => {
    expect(normalizeDomain("rival.com")).toBe("rival.com");
  });
});
