/* resolveFilePath — contención anti-traversal de /docs/[...slug]. */

import { describe, it, expect } from "vitest";
import path from "path";
import { resolveFilePath } from "./resolve-file-path";

const DOCS_ROOT = path.resolve(process.cwd(), "docs");

describe("resolveFilePath — seguridad de slug", () => {
  it("rechaza segmentos '..' (path traversal)", () => {
    expect(resolveFilePath([".."])).toBeNull();
    expect(resolveFilePath(["..", "..", "package"])).toBeNull();
    expect(resolveFilePath(["architecture", "..", "..", "src", "env"])).toBeNull();
  });

  it("rechaza segmentos '.' y vacíos", () => {
    expect(resolveFilePath(["."])).toBeNull();
    expect(resolveFilePath([""])).toBeNull();
    expect(resolveFilePath(["docs", ""])).toBeNull();
  });

  it("rechaza separadores de ruta y null bytes", () => {
    expect(resolveFilePath(["/etc/passwd"])).toBeNull();
    expect(resolveFilePath(["..\\..\\windows"])).toBeNull();
    expect(resolveFilePath(["a/b"])).toBeNull();
    expect(resolveFilePath(["file\0.md"])).toBeNull();
  });

  it("rechaza lista de slug vacía", () => {
    expect(resolveFilePath([])).toBeNull();
  });

  it("resuelve un slug mapeado dentro de docs/", () => {
    const resolved = resolveFilePath(["installation"]);
    expect(resolved).not.toBeNull();
    expect(resolved!.startsWith(DOCS_ROOT + path.sep)).toBe(true);
  });

  it("resuelve un slug anidado mapeado dentro de docs/", () => {
    const resolved = resolveFilePath(["architecture", "pipeline-history"]);
    expect(resolved).not.toBeNull();
    expect(resolved!.startsWith(DOCS_ROOT + path.sep)).toBe(true);
  });

  it("devuelve null para un slug legítimo inexistente", () => {
    expect(resolveFilePath(["no-existe-xyz"])).toBeNull();
  });
});
