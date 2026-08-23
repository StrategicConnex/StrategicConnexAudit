import { describe, it, expect } from "vitest";
import { getErrorMessage } from "./errors";

describe("getErrorMessage", () => {
  it("extrae message de Error", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
  });
  it("devuelve el string si error es string", () => {
    expect(getErrorMessage("fallo plano")).toBe("fallo plano");
  });
  it("devuelve fallback para valores no serializables", () => {
    expect(getErrorMessage({ weird: true })).toBe("Error desconocido");
    expect(getErrorMessage(undefined)).toBe("Error desconocido");
    expect(getErrorMessage(null)).toBe("Error desconocido");
  });
});
