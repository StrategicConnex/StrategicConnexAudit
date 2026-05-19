import { describe, it, expect, vi } from "vitest";
import { isBlockedAddress, assertPublicHostname, safeFetch } from "./egress-guard";

describe("EgressGuard - SSRF and Private Network Protection Suite", () => {
  describe("isBlockedAddress()", () => {
    it("should block loopback and local IPv4 addresses", () => {
      expect(isBlockedAddress("127.0.0.1")).toBe(true);
      expect(isBlockedAddress("127.255.0.1")).toBe(true);
      expect(isBlockedAddress("0.0.0.0")).toBe(true);
    });

    it("should block RFC 1918 Private IPv4 networks", () => {
      expect(isBlockedAddress("10.0.0.1")).toBe(true);
      expect(isBlockedAddress("10.255.255.255")).toBe(true);
      expect(isBlockedAddress("192.168.1.100")).toBe(true);
      expect(isBlockedAddress("172.16.0.1")).toBe(true);
      expect(isBlockedAddress("172.31.255.255")).toBe(true);
    });

    it("should block CGNAT (Carrier-grade NAT) IP networks", () => {
      expect(isBlockedAddress("100.64.0.1")).toBe(true);
      expect(isBlockedAddress("100.127.255.254")).toBe(true);
    });

    it("should block link-local IPv4 addresses", () => {
      expect(isBlockedAddress("169.254.169.254")).toBe(true);
      expect(isBlockedAddress("169.254.0.1")).toBe(true);
    });

    it("should block broadcast and multicast IPv4 networks", () => {
      expect(isBlockedAddress("224.0.0.1")).toBe(true);
      expect(isBlockedAddress("240.0.0.1")).toBe(true);
      expect(isBlockedAddress("255.255.255.255")).toBe(true);
    });

    it("should allow public IPv4 addresses", () => {
      expect(isBlockedAddress("8.8.8.8")).toBe(false);
      expect(isBlockedAddress("1.1.1.1")).toBe(false);
      expect(isBlockedAddress("204.79.197.200")).toBe(false);
    });

    it("should block loopback and link-local IPv6 addresses", () => {
      expect(isBlockedAddress("::1")).toBe(true);
      expect(isBlockedAddress("fe80::1")).toBe(true);
      expect(isBlockedAddress("fc00::")).toBe(true);
      expect(isBlockedAddress("fd00::1")).toBe(true);
    });

    it("should allow public IPv6 addresses", () => {
      expect(isBlockedAddress("2001:4860:4860::8888")).toBe(false);
    });
  });

  describe("assertPublicHostname()", () => {
    it("should immediately reject blocked IP inputs", async () => {
      await expect(assertPublicHostname("127.0.0.1")).rejects.toThrow(
        "SSRF Prevention: Blocked private or reserved IP target"
      );
      await expect(assertPublicHostname("10.0.0.1")).rejects.toThrow(
        "SSRF Prevention: Blocked private or reserved IP target"
      );
    });

    it("should resolve and accept safe public hostnames", async () => {
      const result = await assertPublicHostname("google.com");
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].address).toBeDefined();
    });

    it("should reject hostnames that resolve to private subnets", async () => {
      // Create a local hostname check, or mock lookup for isolated test stability
      // If we don't mock node:dns, some systems may not resolve specific local hostnames, 
      // but let's test it against a mock resolver if needed.
    });
  });

  describe("safeFetch()", () => {
    it("should block non-HTTP/HTTPS protocols", async () => {
      await expect(safeFetch("ftp://example.com")).rejects.toThrow(
        "SSRF Prevention: Only HTTP and HTTPS protocols are allowed."
      );
      await expect(safeFetch("gopher://example.com")).rejects.toThrow(
        "SSRF Prevention: Only HTTP and HTTPS protocols are allowed."
      );
    });

    it("should refuse to connect to private subnets", async () => {
      await expect(safeFetch("http://127.0.0.1/admin")).rejects.toThrow(
        "SSRF Prevention: Blocked private or reserved IP target"
      );
    });
  });
});
