import { z } from "zod";

export type ToolCategory =
  | "dns"
  | "network"
  | "email-security"
  | "website"
  | "ssl-tls"
  | "threat"
  | "osint"
  | "ai";

export type ToolRisk = "passive" | "active-safe" | "active-intrusive";

export interface IntelligenceToolDefinition<TInput extends z.ZodTypeAny = z.ZodTypeAny> {
  id: string;
  name: string;
  category: ToolCategory;
  description: string;
  inputSchema: TInput;
  requiredPlan: "free" | "pro" | "business" | "enterprise";
  risk: ToolRisk;
  costUnits: number;
  cacheTtlSeconds: number;
  timeoutMs: number;
  executor: string;
}

const domainInput = z.object({ domain: z.string().min(3).max(253) });
const hostInput = z.object({ host: z.string().min(3).max(253) });
const ipInput = z.object({ ip: z.string().min(3).max(64) });
const urlInput = z.object({ url: z.string().url() });

export const toolRegistry: IntelligenceToolDefinition[] = [
  { id: "dns.lookup", name: "DNS Lookup", category: "dns", description: "Resolve core DNS records.", inputSchema: domainInput, requiredPlan: "free", risk: "passive", costUnits: 1, cacheTtlSeconds: 300, timeoutMs: 8000, executor: "dns.lookup" },
  { id: "dns.mx", name: "MX Lookup", category: "dns", description: "Resolve mail exchangers and related addresses.", inputSchema: domainInput, requiredPlan: "free", risk: "passive", costUnits: 1, cacheTtlSeconds: 900, timeoutMs: 8000, executor: "dns.mx" },
  { id: "dns.txt", name: "TXT Lookup", category: "dns", description: "Resolve TXT records and classify security records.", inputSchema: domainInput, requiredPlan: "free", risk: "passive", costUnits: 1, cacheTtlSeconds: 900, timeoutMs: 8000, executor: "dns.txt" },
  { id: "dns.ns", name: "NS Lookup", category: "dns", description: "Resolve authoritative nameservers.", inputSchema: domainInput, requiredPlan: "free", risk: "passive", costUnits: 1, cacheTtlSeconds: 1800, timeoutMs: 8000, executor: "dns.ns" },
  { id: "email.spf", name: "SPF Analyzer", category: "email-security", description: "Parse SPF mechanisms and lookup count.", inputSchema: domainInput, requiredPlan: "free", risk: "passive", costUnits: 2, cacheTtlSeconds: 1800, timeoutMs: 12000, executor: "email.spf" },
  { id: "email.dkim", name: "DKIM Analyzer", category: "email-security", description: "Validate DKIM selector records.", inputSchema: domainInput.extend({ selector: z.string().default("default") }), requiredPlan: "pro", risk: "passive", costUnits: 2, cacheTtlSeconds: 1800, timeoutMs: 12000, executor: "email.dkim" },
  { id: "email.dmarc", name: "DMARC Analyzer", category: "email-security", description: "Parse DMARC policy and reporting.", inputSchema: domainInput, requiredPlan: "free", risk: "passive", costUnits: 2, cacheTtlSeconds: 1800, timeoutMs: 12000, executor: "email.dmarc" },
  { id: "dns.dnssec", name: "DNSSEC Validation", category: "dns", description: "Validate DNSSEC chain signals.", inputSchema: domainInput, requiredPlan: "pro", risk: "passive", costUnits: 2, cacheTtlSeconds: 1800, timeoutMs: 15000, executor: "dns.dnssec" },
  { id: "network.reverse_dns", name: "Reverse DNS", category: "network", description: "Resolve PTR records.", inputSchema: ipInput, requiredPlan: "free", risk: "passive", costUnits: 1, cacheTtlSeconds: 1800, timeoutMs: 8000, executor: "network.reverseDns" },
  { id: "dns.propagation", name: "DNS Propagation", category: "dns", description: "Compare answers across resolvers.", inputSchema: domainInput, requiredPlan: "pro", risk: "passive", costUnits: 4, cacheTtlSeconds: 120, timeoutMs: 20000, executor: "dns.propagation" },
  { id: "dns.zone", name: "Zone Analysis", category: "dns", description: "Analyze SOA, NS, DNSSEC and common records.", inputSchema: domainInput, requiredPlan: "business", risk: "passive", costUnits: 4, cacheTtlSeconds: 1800, timeoutMs: 25000, executor: "dns.zone" },
  { id: "network.ping", name: "Ping", category: "network", description: "Measure reachability and latency.", inputSchema: hostInput, requiredPlan: "free", risk: "active-safe", costUnits: 1, cacheTtlSeconds: 30, timeoutMs: 10000, executor: "network.ping" },
  { id: "network.traceroute", name: "Traceroute", category: "network", description: "Trace network path to target.", inputSchema: hostInput, requiredPlan: "pro", risk: "active-safe", costUnits: 3, cacheTtlSeconds: 120, timeoutMs: 45000, executor: "network.traceroute" },
  { id: "network.asn", name: "ASN Lookup", category: "network", description: "Resolve ASN and allocation metadata.", inputSchema: ipInput, requiredPlan: "free", risk: "passive", costUnits: 1, cacheTtlSeconds: 3600, timeoutMs: 10000, executor: "network.asn" },
  { id: "osint.whois", name: "WHOIS / RDAP", category: "osint", description: "Fetch registration and ownership metadata.", inputSchema: domainInput, requiredPlan: "free", risk: "passive", costUnits: 2, cacheTtlSeconds: 21600, timeoutMs: 20000, executor: "osint.whois" },
  { id: "threat.ip_reputation", name: "IP Reputation", category: "threat", description: "Enrich IP with reputation feeds.", inputSchema: ipInput, requiredPlan: "business", risk: "passive", costUnits: 4, cacheTtlSeconds: 900, timeoutMs: 15000, executor: "threat.ipReputation" },
  { id: "network.geoip", name: "GeoIP", category: "network", description: "Locate IP geography and provider.", inputSchema: ipInput, requiredPlan: "free", risk: "passive", costUnits: 1, cacheTtlSeconds: 86400, timeoutMs: 8000, executor: "network.geoip" },
  { id: "network.port_scan", name: "Port Scanner", category: "network", description: "Check approved ports for exposure.", inputSchema: hostInput.extend({ ports: z.array(z.number().int().min(1).max(65535)).max(20) }), requiredPlan: "business", risk: "active-intrusive", costUnits: 8, cacheTtlSeconds: 600, timeoutMs: 60000, executor: "network.portScan" },
  { id: "tls.scan", name: "TLS Scanner", category: "ssl-tls", description: "Inspect certificate chain and protocol posture.", inputSchema: hostInput, requiredPlan: "free", risk: "active-safe", costUnits: 2, cacheTtlSeconds: 1800, timeoutMs: 15000, executor: "tls.scan" },
  { id: "website.headers", name: "HTTP Headers", category: "website", description: "Fetch HTTP response headers safely.", inputSchema: urlInput, requiredPlan: "free", risk: "active-safe", costUnits: 1, cacheTtlSeconds: 300, timeoutMs: 12000, executor: "website.headers" },
  { id: "network.cdn", name: "CDN Detection", category: "network", description: "Detect CDN from DNS and headers.", inputSchema: domainInput, requiredPlan: "pro", risk: "passive", costUnits: 2, cacheTtlSeconds: 1800, timeoutMs: 15000, executor: "network.cdn" },
  { id: "network.waf", name: "WAF Detection", category: "network", description: "Passive WAF/provider detection.", inputSchema: urlInput, requiredPlan: "business", risk: "active-safe", costUnits: 3, cacheTtlSeconds: 1800, timeoutMs: 15000, executor: "network.waf" },
  { id: "network.reverse_ip", name: "Reverse IP", category: "network", description: "Discover related hosts when provider allows.", inputSchema: ipInput, requiredPlan: "business", risk: "passive", costUnits: 5, cacheTtlSeconds: 21600, timeoutMs: 20000, executor: "network.reverseIp" },
  { id: "network.bgp", name: "BGP Analysis", category: "network", description: "Analyze prefix and route origin.", inputSchema: ipInput, requiredPlan: "enterprise", risk: "passive", costUnits: 4, cacheTtlSeconds: 900, timeoutMs: 20000, executor: "network.bgp" },
  { id: "email.mail_health", name: "Mail Health", category: "email-security", description: "Composite email posture report.", inputSchema: domainInput, requiredPlan: "pro", risk: "passive", costUnits: 6, cacheTtlSeconds: 1800, timeoutMs: 45000, executor: "email.mailHealth" },
  { id: "email.smtp", name: "SMTP Diagnostics", category: "email-security", description: "SMTP handshake diagnostics without sending mail.", inputSchema: domainInput, requiredPlan: "business", risk: "active-safe", costUnits: 5, cacheTtlSeconds: 600, timeoutMs: 30000, executor: "email.smtp" },
  { id: "email.blacklists", name: "Blacklist Checks", category: "email-security", description: "DNSBL checks for domain/MX IPs.", inputSchema: domainInput, requiredPlan: "pro", risk: "passive", costUnits: 4, cacheTtlSeconds: 1800, timeoutMs: 30000, executor: "email.blacklists" },
  { id: "email.bimi", name: "BIMI Analysis", category: "email-security", description: "BIMI TXT, logo and VMC posture.", inputSchema: domainInput, requiredPlan: "pro", risk: "passive", costUnits: 3, cacheTtlSeconds: 1800, timeoutMs: 15000, executor: "email.bimi" },
  { id: "email.score", name: "Email Security Score", category: "email-security", description: "Composite email score.", inputSchema: domainInput, requiredPlan: "pro", risk: "passive", costUnits: 8, cacheTtlSeconds: 1800, timeoutMs: 60000, executor: "email.score" },
  { id: "email.server_reputation", name: "Mail Server Reputation", category: "email-security", description: "Reputation for MX infrastructure.", inputSchema: domainInput, requiredPlan: "business", risk: "passive", costUnits: 5, cacheTtlSeconds: 1800, timeoutMs: 30000, executor: "email.serverReputation" },
  { id: "website.security_headers", name: "Security Headers", category: "website", description: "Evaluate HSTS, CSP, XFO, referrer policy and more.", inputSchema: urlInput, requiredPlan: "free", risk: "active-safe", costUnits: 2, cacheTtlSeconds: 300, timeoutMs: 12000, executor: "website.securityHeaders" },
  { id: "website.tech_stack", name: "Tech Stack Detection", category: "website", description: "Passive technology fingerprinting.", inputSchema: urlInput, requiredPlan: "pro", risk: "active-safe", costUnits: 3, cacheTtlSeconds: 1800, timeoutMs: 15000, executor: "website.techStack" },
  { id: "website.redirects", name: "Redirect Analysis", category: "website", description: "Follow and score redirect chains.", inputSchema: urlInput, requiredPlan: "free", risk: "active-safe", costUnits: 2, cacheTtlSeconds: 300, timeoutMs: 15000, executor: "website.redirects" },
  { id: "website.cookies", name: "Cookie Analysis", category: "website", description: "Parse Set-Cookie flags.", inputSchema: urlInput, requiredPlan: "free", risk: "active-safe", costUnits: 2, cacheTtlSeconds: 300, timeoutMs: 12000, executor: "website.cookies" },
  { id: "website.csp", name: "CSP Analysis", category: "website", description: "Parse and score Content-Security-Policy.", inputSchema: urlInput, requiredPlan: "pro", risk: "active-safe", costUnits: 3, cacheTtlSeconds: 600, timeoutMs: 12000, executor: "website.csp" },
  { id: "website.performance", name: "Performance Diagnostics", category: "website", description: "Lighthouse-style metrics and bottlenecks.", inputSchema: urlInput, requiredPlan: "business", risk: "active-safe", costUnits: 8, cacheTtlSeconds: 1800, timeoutMs: 90000, executor: "website.performance" },
  { id: "website.fingerprint", name: "Fingerprinting", category: "website", description: "Collect passive application fingerprints.", inputSchema: urlInput, requiredPlan: "business", risk: "active-safe", costUnits: 4, cacheTtlSeconds: 1800, timeoutMs: 20000, executor: "website.fingerprint" },
  { id: "threat.custom_intel", name: "Custom Threat Intel", category: "threat", description: "Cross reference with custom private intel feeds.", inputSchema: domainInput, requiredPlan: "enterprise", risk: "passive", costUnits: 10, cacheTtlSeconds: 600, timeoutMs: 15000, executor: "threat.custom_intel" },
];

export function getToolDefinition(id: string): IntelligenceToolDefinition | undefined {
  return toolRegistry.find((t) => t.id === id);
}

