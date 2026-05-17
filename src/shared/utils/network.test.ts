import { describe, it, expect } from "vitest";
import { isPrivateIp, normalizeUrl, validateSafeUrl } from "./network";

describe("isPrivateIp", () => {
  it("should return true for IPv4 loopback & private subnets", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("10.0.0.1")).toBe(true);
    expect(isPrivateIp("172.16.5.2")).toBe(true);
    expect(isPrivateIp("192.168.1.1")).toBe(true);
    expect(isPrivateIp("169.254.10.1")).toBe(true);
    expect(isPrivateIp("0.0.0.0")).toBe(true);
    expect(isPrivateIp("255.255.255.255")).toBe(true);
  });

  it("should return true for IPv6 loopback & private local subnets", () => {
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("0:0:0:0:0:0:0:1")).toBe(true);
    expect(isPrivateIp("fe80::1")).toBe(true);
    expect(isPrivateIp("fc00::abc")).toBe(true);
  });

  it("should return false for public IP addresses", () => {
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("1.1.1.1")).toBe(false);
    expect(isPrivateIp("142.250.190.46")).toBe(false);
    expect(isPrivateIp("2607:f8b0:4005:805::200e")).toBe(false);
  });
});

describe("normalizeUrl", () => {
  it("should return correct scheme prefix for domains", () => {
    expect(normalizeUrl("example.com")).toBe("https://example.com");
    expect(normalizeUrl("www.google.com")).toBe("https://www.google.com");
  });

  it("should preserve already valid URLs", () => {
    expect(normalizeUrl("https://scaudit.vercel.app")).toBe("https://scaudit.vercel.app");
    expect(normalizeUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("should handle spacing gracefully", () => {
    expect(normalizeUrl("   github.com/org   ")).toBe("https://github.com/org");
  });

  it("should return empty string for empty input", () => {
    expect(normalizeUrl("")).toBe("");
  });
});

describe("validateSafeUrl", () => {
  it("should accept valid public URLs", async () => {
    const url = "https://google.com";
    const res = await validateSafeUrl(url);
    expect(res).toBe(url);
  });

  it("should reject non HTTP/HTTPS schemes", async () => {
    await expect(validateSafeUrl("ftp://test.com")).rejects.toThrow("Protocolo no soportado");
    await expect(validateSafeUrl("javascript:alert(1)")).rejects.toThrow();
  });

  it("should reject private IPv4 hosts", async () => {
    await expect(validateSafeUrl("https://127.0.0.1")).rejects.toThrow("Acceso denegado");
    await expect(validateSafeUrl("http://192.168.0.1")).rejects.toThrow("Acceso denegado");
  });
});
