import { lookup } from "node:dns/promises";
import net from "node:net";

/* ═══════════════════════════════════════════════════════════════════
   Egress Guard — SSRF & Private Network Protection
   
   Unified implementation combining regex-based blocking with
   precise CIDR mathematical matching for IPv4 and IPv6.
   ═══════════════════════════════════════════════════════════════════ */

// ------------------------------------------------------------------
// Private / reserved subnet definitions (CIDR format)
// ------------------------------------------------------------------
const PRIVATE_V4_PREFIXES = [
  "0.0.0.0/8",        // Current network
  "10.0.0.0/8",       // RFC 1918 Private
  "100.64.0.0/10",    // Shared address space (CGNAT)
  "127.0.0.0/8",      // Loopback
  "169.254.0.0/16",   // Link-local
  "172.16.0.0/12",    // RFC 1918 Private
  "192.0.0.0/24",     // IETF Protocol Assignments
  "192.0.2.0/24",     // Documentation
  "192.88.99.0/24",   // Reserved
  "192.168.0.0/16",   // RFC 1918 Private
  "198.18.0.0/15",    // Network benchmark tests
  "198.51.100.0/22",  // Documentation
  "203.0.113.0/24",   // Documentation
  "224.0.0.0/4",      // Multicast
  "240.0.0.0/4",      // Reserved
  "255.255.255.255/32", // Broadcast
];

const PRIVATE_V6_PREFIXES = [
  "::/128",          // Unspecified address
  "::1/128",         // Loopback
  "100::/64",        // Blackhole
  "2001:db8::/32",   // Documentation
  "fc00::/7",        // Unique local
  "fe80::/10",       // Link-local
  "ff00::/8",        // Multicast
];

// ------------------------------------------------------------------
// CIDR helper functions
// ------------------------------------------------------------------
function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function normalizeIPv6(ip: string): string {
  let fullIp = ip;
  if (fullIp.includes("::")) {
    const parts = fullIp.split("::");
    const left = parts[0] ? parts[0].split(":") : [];
    const right = parts[1] ? parts[1].split(":") : [];
    const missing = 8 - (left.length + right.length);
    const middle = Array(missing).fill("0000");
    fullIp = [...left, ...middle, ...right].join(":");
  }
  return fullIp.split(":").map((part) => part.padStart(4, "0")).join(":");
}

function ipv6ToBuffer(ip: string): Uint8Array {
  const buffer = new Uint8Array(16);
  const normalized = normalizeIPv6(ip);
  const parts = normalized.split(":");
  for (let i = 0; i < 8; i++) {
    const val = parseInt(parts[i], 16);
    buffer[i * 2] = (val >> 8) & 0xff;
    buffer[i * 2 + 1] = val & 0xff;
  }
  return buffer;
}

function ipInCidr(ip: string, cidr: string): boolean {
  const [subnet, prefixStr] = cidr.split("/");
  const prefix = parseInt(prefixStr, 10);

  if (net.isIPv4(ip) && net.isIPv4(subnet)) {
    const ipInt = ipv4ToInt(ip);
    const subnetInt = ipv4ToInt(subnet);
    const mask = prefix === 0 ? 0 : ~((1 << (32 - prefix)) - 1);
    return (ipInt & mask) === (subnetInt & mask);
  }

  if (net.isIPv6(ip) && net.isIPv6(subnet)) {
    const ipBuf = ipv6ToBuffer(ip);
    const subnetBuf = ipv6ToBuffer(subnet);

    let bits = prefix;
    for (let i = 0; i < 16; i++) {
      if (bits <= 0) break;
      const maskSize = Math.min(bits, 8);
      const mask = ((0xff00 >> maskSize) & 0xff) >>> 0;
      if ((ipBuf[i] & mask) !== (subnetBuf[i] & mask)) {
        return false;
      }
      bits -= 8;
    }
    return true;
  }

  return false;
}

/**
 * Extracts the embedded IPv4 address from an IPv4-mapped IPv6 address
 * (RFC 4291 §2.5.5.2), e.g. `::ffff:127.0.0.1` → `127.0.0.1` or the
 * hexadecimal form `::ffff:7f00:1` → `127.0.0.1`. Returns null when the
 * address is not IPv4-mapped.
 */
function ipv4MappedToIpv4(ip: string): string | null {
  const lower = ip.toLowerCase();

  // Dotted-quad form: ::ffff:127.0.0.1
  const dotted = lower.match(/::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) return dotted[1];

  // Hexadecimal form: last 32 bits encode the IPv4, e.g. ::ffff:7f00:1
  const hex = lower.match(/^(?:.*:)?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }

  return null;
}

/**
 * Checks if an IP address resides within blocked/private subnets or loopback interfaces.
 * Uses CIDR mathematical matching for precision across all RFC-defined private ranges.
 */
export function isBlockedAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    for (const cidr of PRIVATE_V4_PREFIXES) {
      if (ipInCidr(address, cidr)) return true;
    }
    return false;
  }

  if (net.isIPv6(address)) {
    // IPv4-mapped IPv6 addresses must be checked against the IPv4 ranges,
    // otherwise a private IP like ::ffff:127.0.0.1 bypasses the guard (SSRF).
    const embedded = ipv4MappedToIpv4(address);
    if (embedded) return isBlockedAddress(embedded);

    for (const cidr of PRIVATE_V6_PREFIXES) {
      if (ipInCidr(address, cidr)) return true;
    }
    return false;
  }

  // Unrecognised address family — block as unsafe
  return true;
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

  const redirectMode = init.redirect ?? "manual";

  const response = await fetch(parsed.toString(), {
    ...init,
    redirect: redirectMode,
    signal: init.signal ?? AbortSignal.timeout(15_000),
    headers: {
      "User-Agent": "SCAuditIntelligenceBot/1.0 (+https://scaudit.app/security)",
      ...init.headers,
    },
  });

  // Solo validamos SSRF en redirecciones cuando el modo es manual
  // (modo "follow" delega la seguridad al caller que eligió explícitamente)
  if (redirectMode === "manual") {
    const location = response.headers.get("location");
    if (location && response.status >= 300 && response.status < 400) {
      const next = new URL(location, parsed);
      await assertPublicHostname(next.hostname);
    }
  }

  return response;
}
export type SafeFetch = typeof safeFetch;

// ─── Shared Network Utilities (consolidated from network.ts) ────────────

/**
 * Alias for isBlockedAddress — kept for backward compatibility with
 * code that imports from the old shared/utils/network.ts.
 */
export const isPrivateIp = isBlockedAddress;

/**
 * Safely normalizes any input domain or URL to have a valid http/https prefix.
 */
export function normalizeUrl(url: string): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/**
 * Validates that a target URL is safe to visit (prevents SSRF and DNS Rebinding).
 * Similar to assertPublicHostname but accepts a full URL and returns the URL string.
 */
export async function validateSafeUrl(targetUrl: string): Promise<string> {
  const parsedUrl = new URL(targetUrl);

  // 1. Enforce strict http/https protocol
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error(`Protocolo no soportado: ${parsedUrl.protocol}. Solo se admiten HTTP y HTTPS.`);
  }

  const hostname = parsedUrl.hostname;

  // 2. Direct validation if hostname is raw IP
  if (net.isIP(hostname)) {
    if (isBlockedAddress(hostname)) {
      throw new Error(`Acceso denegado: IP privada detectada (${hostname})`);
    }
    return targetUrl;
  }

  // 3. DNS Lookup — check all resolved addresses
  try {
    const addresses = await lookup(hostname, { all: true });
    for (const address of addresses) {
      if (isBlockedAddress(address.address)) {
        throw new Error(`Acceso denegado: El host ${hostname} se resuelve a una IP privada (${address.address})`);
      }
    }
  } catch (dnsErr: unknown) {
    const err = dnsErr as Error;
    if (err?.message?.includes("Acceso denegado")) {
      throw err;
    }
    console.warn(`[EgressGuard] No se pudo resolver DNS para el host ${hostname}:`, err?.message || err);
  }

  return targetUrl;
}

