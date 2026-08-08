/* ═══════════════════════════════════════════════════════════════════════════
   safe-next — Tests anti-open-redirect (RULE-007 v3.1)
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect } from "vitest";
import { sanitizeNextPath } from "./safe-next";

describe("sanitizeNextPath (anti-open-redirect)", () => {
  it("permite rutas relativas simples", () => {
    expect(sanitizeNextPath("/dashboard")).toBe("/dashboard");
    expect(sanitizeNextPath("/projects/abc123")).toBe("/projects/abc123");
    expect(sanitizeNextPath("/")).toBe("/");
  });

  it("bloquea URLs externas (dominios)", () => {
    expect(sanitizeNextPath("https://evil.com")).toBe("/");
    expect(sanitizeNextPath("http://evil.com")).toBe("/");
    expect(sanitizeNextPath("evil.com")).toBe("/");
    expect(sanitizeNextPath("www.evil.com/path")).toBe("/");
  });

  it("bloquea URLs protocol-relative (//)", () => {
    expect(sanitizeNextPath("//evil.com")).toBe("/");
    expect(sanitizeNextPath("///evil.com")).toBe("/");
    expect(sanitizeNextPath("//evil.com/path")).toBe("/");
  });

  it("bloquea otros schemes (mailto, javascript, data)", () => {
    expect(sanitizeNextPath("mailto:attacker@evil.com")).toBe("/");
    expect(sanitizeNextPath("javascript:alert(1)")).toBe("/");
    expect(sanitizeNextPath("data:text/html,<script>")).toBe("/");
  });

  it("bloquea backslash (truco de navegadores)", () => {
    expect(sanitizeNextPath("\\evil.com")).toBe("/");
    expect(sanitizeNextPath("/\\evil.com")).toBe("/");
  });

  it("bloquea espacios/whitespace al inicio", () => {
    expect(sanitizeNextPath("  https://evil.com")).toBe("/");
    expect(sanitizeNextPath(" javascript:alert(1)")).toBe("/");
  });

  it("maneja valores nulos/undefined/vacíos con fallback a /", () => {
    expect(sanitizeNextPath(null)).toBe("/");
    expect(sanitizeNextPath(undefined)).toBe("/");
    expect(sanitizeNextPath("")).toBe("/");
  });

  it("permite rutas con query y fragmento (internos)", () => {
    expect(sanitizeNextPath("/dashboard?tab=security")).toBe("/dashboard?tab=security");
    expect(sanitizeNextPath("/docs#section")).toBe("/docs#section");
  });
});
