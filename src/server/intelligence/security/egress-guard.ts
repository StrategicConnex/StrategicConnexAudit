import { lookup } from "node:dns/promises";
import net from "node:net";

const blockedIpv4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^224\./,
  /^240\./,
];

/**
 * Checks if an IP address resides within blocked/private subnets or loopback interfaces.
 */
export function isBlockedAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    return blockedIpv4.some((r) => r.test(address)) || address === "255.255.255.255";
  }
  const lower = address.toLowerCase();
  return lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd");
}

/**
 * Asserts that a hostname resolves exclusively to public, safe internet IP addresses.
 * Throws a security exception if resolving to any blocked private range.
 */
export async function assertPublicHostname(hostname: string) {
  // Allow development bypass if explicitly configured
  if (process.env.NODE_ENV === "development" && process.env.BYPASS_EGRESS_GUARD_DEV === "true") {
    return [{ address: hostname, family: net.isIPv6(hostname) ? 6 : 4 }];
  }

  if (net.isIP(hostname)) {
    if (isBlockedAddress(hostname)) {
      throw new Error(`SSRF Prevention: Blocked private or reserved IP target: ${hostname}`);
    }
    return [{ address: hostname, family: net.isIPv6(hostname) ? 6 : 4 }];
  }

  const addresses = await lookup(hostname, { all: true, verbatim: false });
  if (!addresses.length) {
    throw new Error("SSRF Prevention: Target hostname did not resolve to any addresses.");
  }

  for (const address of addresses) {
    if (isBlockedAddress(address.address)) {
      throw new Error(`SSRF Prevention: Blocked DNS resolution to private/reserved address: ${address.address}`);
    }
  }
  return addresses;
}

/**
 * Replaces generic fetch() calls with secure, SSRF-guarded fetching logic.
 * Enforces timeouts, custom User-Agents, manual redirects, and validation of redirection destinations.
 */
export async function safeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("SSRF Prevention: Only HTTP and HTTPS protocols are allowed.");
  }
  
  await assertPublicHostname(parsed.hostname);

  const response = await fetch(parsed.toString(), {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "User-Agent": "SCAuditIntelligenceBot/1.0 (+https://scaudit.app/security)",
      ...init.headers,
    },
  });

  const location = response.headers.get("location");
  if (location && response.status >= 300 && response.status < 400) {
    const next = new URL(location, parsed);
    await assertPublicHostname(next.hostname);
  }

  return response;
}
export type SafeFetch = typeof safeFetch;
