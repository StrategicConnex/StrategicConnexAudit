import { describe, it, expect, vi, afterEach } from "vitest";
import { setCookie, getCookie } from "./cookie-utils";

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = "";
});

describe("cookie-utils — lectura/escritura de cookies (jsdom)", () => {
  it("setCookie escribe name=value con encodeURIComponent", () => {
    setCookie("mi_cookie", "valor con espacios & símbolos", 1);
    expect(getCookie("mi_cookie")).toBe("valor con espacios & símbolos");
  });

  it("getCookie devuelve null para cookies inexistentes", () => {
    expect(getCookie("no_existe")).toBeNull();
  });

  it("getCookie no confunde prefijos de nombre (coincidencia exacta)", () => {
    document.cookie = "token=abc; path=/";
    document.cookie = "token2=xyz; path=/";
    expect(getCookie("token")).toBe("abc");
    expect(getCookie("token2")).toBe("xyz");
  });

  it("getCookie lee cookies que NO son la primera de la cadena (fix \\s)", () => {
    setCookie("primera", "1", 1);
    setCookie("segunda", "2", 1);
    setCookie("tercera", "3", 1);
    // La cookie del medio solo es legible si el regex separa por "; " correctamente
    expect(getCookie("segunda")).toBe("2");
    expect(getCookie("tercera")).toBe("3");
  });

  it("getCookie devuelve null con cadena vacía", () => {
    expect(getCookie("a")).toBeNull();
  });

  it("setCookie no lanza y es no-op cuando document no existe (SSR guard)", () => {
    vi.stubGlobal("document", undefined);
    expect(() => setCookie("x", "y", 1)).not.toThrow();
  });

  it("getCookie devuelve null cuando document no existe (SSR guard)", () => {
    vi.stubGlobal("document", undefined);
    expect(getCookie("x")).toBeNull();
  });

  it("valores con caracteres especiales se decodifican correctamente", () => {
    setCookie("auth", "a=b&c=d", 7);
    expect(getCookie("auth")).toBe("a=b&c=d");
  });
});
