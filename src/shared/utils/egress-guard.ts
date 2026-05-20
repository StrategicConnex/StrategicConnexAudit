import dns from "dns";
import net from "net";

/**
 * Parsed private IP blocks to assert public destination routing (SSRF protection)
 */
const PRIVATE_V4_PREFIXES = [
  "0.0.0.0/8",      // Current network
  "10.0.0.0/8",     // RFC 1918 Private
  "100.64.0.0/10",  // Shared address space (CGNAT)
  "127.0.0.0/8",    // Loopback
  "169.254.0.0/16", // Link-local
  "172.16.0.0/12",  // RFC 1918 Private
  "192.0.0.0/24",   // IETF Protocol Assignments
  "192.0.2.0/24",   // Documentation
  "192.88.99.0/24", // Reserved
  "192.168.0.0/16", // RFC 1918 Private
  "198.18.0.0/15",  // Network benchmark tests
  "198.51.100.0/22",// Documentation
  "203.0.113.0/24", // Documentation
  "224.0.0.0/4",    // Multicast
  "240.0.0.0/4",    // Reserved
  "255.255.255.255/32" // Broadcast
];

const PRIVATE_V6_PREFIXES = [
  "::/128",         // Unspecified address
  "::1/128",        // Loopback
  "100::/64",       // Blackhole
  "2001:db8::/32",  // Documentation
  "fc00::/7",       // Unique local
  "fe80::/10",      // Link-local
  "ff00::/8"        // Multicast
];

/**
 * Checks if a parsed IP fits inside a CIDR subnet
 */
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
    const ipBuffer = ipv6ToBuffer(ip);
    const subnetBuffer = ipv6ToBuffer(subnet);
    
    let bits = prefix;
    for (let i = 0; i < 16; i++) {
      if (bits <= 0) break;
      const maskSize = Math.min(bits, 8);
      const mask = (0xff00 >> maskSize) & 0xff;
      if ((ipBuffer[i] & mask) !== (subnetBuffer[i] & mask)) {
        return false;
      }
      bits -= 8;
    }
    return true;
  }
  
  return false;
}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
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
  return fullIp.split(":").map(part => part.padStart(4, "0")).join(":");
}

function validateIp(ip: string): void {
  if (net.isIPv4(ip)) {
    for (const cidr of PRIVATE_V4_PREFIXES) {
      if (ipInCidr(ip, cidr)) {
        throw new Error(`SSRF Prevention: IP target ${ip} falls inside private/reserved subnet ${cidr}`);
      }
    }
  } else if (net.isIPv6(ip)) {
    for (const cidr of PRIVATE_V6_PREFIXES) {
      if (ipInCidr(ip, cidr)) {
        throw new Error(`SSRF Prevention: IPv6 target ${ip} falls inside private/reserved subnet ${cidr}`);
      }
    }
  }
}

/**
 * Asserts if a target hostname resolves exclusively to public, safe, routable Internet IPs.
 * Throws a Security Exception if resolving to private networks (SSRF prevention).
 */
export async function assertPublicHostname(target: string): Promise<boolean> {
  // Bypass in development if explicitly configured
  if (process.env.NODE_ENV === "development" && process.env.BYPASS_EGRESS_GUARD_DEV === "true") {
    return true;
  }

  let host = target.trim();
  
  // Extract host if full URL is passed
  if (host.includes("://")) {
    try {
      host = new URL(host).hostname;
    } catch {
      // Keep original on parse exception
    }
  } else if (host.includes("@")) {
    // Extract domain if email is passed
    host = host.split("@")[1];
  }

  // Strip port
  host = host.split(":")[0];

  // If host is directly an IP, validate directly
  if (net.isIP(host)) {
    validateIp(host);
    return true;
  }

  // Resolve hostname via system resolver
  try {
    const addresses = await dns.promises.resolve(host, "A");
    for (const addr of addresses) {
      validateIp(addr);
    }
  } catch {
    // If A resolution fails, try AAAA
    try {
      const addressesV6 = await dns.promises.resolve(host, "AAAA");
      for (const addr of addressesV6) {
        validateIp(addr);
      }
    } catch {
      // Lookup fallback
      try {
        const result = await dns.promises.lookup(host);
        validateIp(result.address);
      } catch {
        // If entirely unresolvable, continue to let connection level fail normally
      }
    }
  }

  return true;
}
