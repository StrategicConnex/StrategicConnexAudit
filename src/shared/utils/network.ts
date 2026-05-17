import { promises as dnsPromises } from "dns";

/**
 * Checks if an IP address belongs to local/private/reserved subnets
 * @param ip IPv4 or IPv6 string
 */
export function isPrivateIp(ip: string): boolean {
  // IPv4 Loopback (127.0.0.0/8)
  if (/^127\./.test(ip)) return true;
  
  // IPv4 Private Networks (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
  if (/^10\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  
  // IPv4 Link-Local (169.254.0.0/16)
  if (/^169\.254\./.test(ip)) return true;

  // IPv4 Carrier-Grade NAT (100.64.0.0/10)
  if (/^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./.test(ip)) return true;

  // IPv4 Current Network / Broadcast (0.0.0.0/8, 255.255.255.255)
  if (/^0\./.test(ip) || ip === "255.255.255.255") return true;

  // IPv6 Loopback (::1)
  if (ip === "::1" || ip === "0:0:0:0:0:0:0:1") return true;

  // IPv6 Link-Local (fe80::/10)
  if (/^fe[89ab][0-9a-f]:/i.test(ip)) return true;

  // IPv6 Unique Local (fc00::/7)
  if (/^f[cd][0-9a-f]{2}:/i.test(ip)) return true;

  return false;
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
  const ipv4Regex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
  if (ipv4Regex.test(hostname)) {
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
    if (err && err.message && err.message.includes("Acceso denegado")) {
      throw err;
    }
    console.warn(`[Crawler Security] No se pudo resolver DNS para el host ${hostname}:`, err?.message || err);
  }


  return targetUrl;
}
