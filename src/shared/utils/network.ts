import { promises as dnsPromises } from "dns";
import net from "net";

/* ═══════════════════════════════════════════════════════════════════
   Network Security Utilities — SSRF protection, URL normalization,
   and private IP detection (CIDR-based).
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
 * Checks if an IP address belongs to local/private/reserved subnets.
 * Uses CIDR mathematical matching for precision across all RFC-defined ranges.
 * @param ip IPv4 or IPv6 string
 */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    for (const cidr of PRIVATE_V4_PREFIXES) {
      if (ipInCidr(ip, cidr)) return true;
    }
    return false;
  }

  if (net.isIPv6(ip)) {
    for (const cidr of PRIVATE_V6_PREFIXES) {
      if (ipInCidr(ip, cidr)) return true;
    }
    return false;
  }

  // Unrecognised address family — treat as private for safety
  return true;
}

/**
 * Safely normalizes any input domain or URL to have a valid http/https prefix
 * @param url Input string containing a domain or partial URL
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
 * Validates that a target URL is safe to scrape (prevents SSRF and DNS Rebinding)
 * @param targetUrl Input URL string
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
    if (isPrivateIp(hostname)) {
      throw new Error(`Acceso denegado: IP privada detectada (${hostname})`);
    }
    return targetUrl;
  }

  // 3. DNS Lookup resolution checking all records to prevent host redirection exploits
  try {
    const addresses = await dnsPromises.lookup(hostname, { all: true });
    for (const address of addresses) {
      if (isPrivateIp(address.address)) {
        throw new Error(`Acceso denegado: El host ${hostname} se resuelve a una IP privada (${address.address})`);
      }
    }
  } catch (dnsErr: unknown) {
    const err = dnsErr as Error;
    if (err?.message?.includes("Acceso denegado")) {
      throw err;
    }
    console.warn(`[Crawler Security] No se pudo resolver DNS para el host ${hostname}:`, err?.message || err);
  }

  return targetUrl;
}
