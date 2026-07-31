/**
 * tool-registry.ts — Single Source of Truth for Intelligence Tools (C05)
 *
 * Consolidates the previous 4 registration surfaces into ONE deep module:
 *   - registry/tool-registry.ts  (types)     → stays as the type home; runtime merged here
 *   - core/executor-registry.ts  (executor map + dynamic)  → merged here (DELETED)
 *   - core/auto-register.ts      (bridge)    → registerTool()
 *   - executors/loader.ts        (auto-discovery) → DELETED (redundant: re-registers
 *     the same 12 modules already statically imported here)
 *
 * Design principles:
 *   - `NATIVE_TOOLS` pairs every executor with its definition in a single array —
 *     the one source of truth. The `executor` string field on each definition is
 *     derived automatically from `executor.id`, eliminating the old drift-prone
 *     duplication (e.g. def `network.reverse_dns` → executor "network.reverseDns").
 *   - `registerTool()` is the ONLY mutation entry point (plugins, custom, dynamic).
 *   - Every read (getExecutor, getToolDefinition, listToolDefinitions, isKnownTool)
 *     hits the same Map store — no two registries that can disagree.
 *   - Type maps (ToolId, ToolInputMap, ToolOutputMap, ToolInputs, ToolOutputs)
 *     are derived from NATIVE_TOOLS via literal-id inference.
 */

import { z } from "zod";
import {
  ToolExecutor,
  InferExecutorInput,
  InferExecutorOutput,
} from "../types/executor.types";
import {
  ToolCategory,
  ToolRisk,
  IntelligenceToolDefinition,
} from "../registry/tool-registry";

// Re-export types so consumers can import from either location.
export type { ToolCategory, ToolRisk, IntelligenceToolDefinition };

/** Entrada del registro: executor + su definición, en un solo lugar. */
export interface ToolRegistration {
  definition: IntelligenceToolDefinition;
  executor: ToolExecutor;
}

/** Definición sin el campo derivado `executor` (fuente de los pares nativos). */
type NativeDefinition = Omit<IntelligenceToolDefinition, "executor">;
interface NativeToolSource {
  executor: ToolExecutor;
  definition: NativeDefinition;
}

// ─── Zod input schemas compartidos ───────────────────────────────────────────

const domainInput = z.object({ domain: z.string().min(3).max(253) });
const hostInput = z.object({ host: z.string().min(3).max(253) });
const ipInput = z.object({ ip: z.string().min(3).max(64) });
const urlInput = z.object({ url: z.string().url() });

// ─── Native Executor Imports ─────────────────────────────────────────────────

import { dnsLookupExecutor, dnsMxExecutor, dnsTxtExecutor, dnsNsExecutor } from "../executors/dns-executors";
import { emailSpfExecutor, emailDmarcExecutor, emailDkimExecutor } from "../executors/email-executors";
import {
  networkPingExecutor, networkReverseDnsExecutor, networkGeoIpExecutor,
  networkTracerouteExecutor, networkAsnExecutor, networkCdnExecutor,
  networkWafExecutor, networkReverseIpExecutor, threatIpReputationExecutor
} from "../executors/network-executors";
import {
  websiteHeadersExecutor, websiteSecurityHeadersExecutor,
  websiteTlsExecutor, websiteRobotsExecutor,
  websiteRedirectsExecutor, websiteCookiesExecutor, websiteCspExecutor
} from "../executors/website-executors";
import { osintWhoisExecutor } from "../executors/osint-executors";
import { technologyProfilerExecutor } from "../executors/technology-profiler";
import { dnsDnssecExecutor, dnsPropagationExecutor, dnsZoneExecutor } from "../executors/dns-advanced";
import { networkBgpExecutor, threatCustomIntelExecutor } from "../executors/advanced-executors";
import { whoisFullExecutor } from "../executors/whois-executors";
import { tlsAdvancedExecutor } from "../executors/tls-advanced";
import { subdomainTakeoverExecutor } from "../executors/subdomain-takeover";
import { cveLookupExecutor } from "../executors/cve-lookup";

// ─── Single Source of Truth: pares executor + definition ────────────────────
// El campo `executor` de cada definition se deriva de executor.id en init.

const NATIVE_TOOLS = [
  { executor: dnsLookupExecutor, definition: { id: "dns.lookup", name: "DNS Lookup", category: "dns", description: "Resolve core DNS records.", inputSchema: domainInput, requiredPlan: "free", risk: "passive", costUnits: 1, cacheTtlSeconds: 300, timeoutMs: 8000 } },
  { executor: dnsMxExecutor, definition: { id: "dns.mx", name: "MX Lookup", category: "dns", description: "Resolve mail exchangers and related addresses.", inputSchema: domainInput, requiredPlan: "free", risk: "passive", costUnits: 1, cacheTtlSeconds: 900, timeoutMs: 8000 } },
  { executor: dnsTxtExecutor, definition: { id: "dns.txt", name: "TXT Lookup", category: "dns", description: "Resolve TXT records and classify security records.", inputSchema: domainInput, requiredPlan: "free", risk: "passive", costUnits: 1, cacheTtlSeconds: 900, timeoutMs: 8000 } },
  { executor: dnsNsExecutor, definition: { id: "dns.ns", name: "NS Lookup", category: "dns", description: "Resolve authoritative nameservers.", inputSchema: domainInput, requiredPlan: "free", risk: "passive", costUnits: 1, cacheTtlSeconds: 1800, timeoutMs: 8000 } },
  { executor: emailSpfExecutor, definition: { id: "email.spf", name: "SPF Analyzer", category: "email-security", description: "Parse SPF mechanisms and lookup count.", inputSchema: domainInput, requiredPlan: "free", risk: "passive", costUnits: 2, cacheTtlSeconds: 1800, timeoutMs: 12000 } },
  { executor: emailDkimExecutor, definition: { id: "email.dkim", name: "DKIM Analyzer", category: "email-security", description: "Validate DKIM selector records.", inputSchema: domainInput.extend({ selector: z.string().default("default") }), requiredPlan: "pro", risk: "passive", costUnits: 2, cacheTtlSeconds: 1800, timeoutMs: 12000 } },
  { executor: emailDmarcExecutor, definition: { id: "email.dmarc", name: "DMARC Analyzer", category: "email-security", description: "Parse DMARC policy and reporting.", inputSchema: domainInput, requiredPlan: "free", risk: "passive", costUnits: 2, cacheTtlSeconds: 1800, timeoutMs: 12000 } },
  { executor: dnsDnssecExecutor, definition: { id: "dns.dnssec", name: "DNSSEC Validation", category: "dns", description: "Validate DNSSEC chain signals.", inputSchema: domainInput, requiredPlan: "pro", risk: "passive", costUnits: 2, cacheTtlSeconds: 1800, timeoutMs: 15000 } },
  { executor: networkReverseDnsExecutor, definition: { id: "network.reverse_dns", name: "Reverse DNS", category: "network", description: "Resolve PTR records.", inputSchema: ipInput, requiredPlan: "free", risk: "passive", costUnits: 1, cacheTtlSeconds: 1800, timeoutMs: 8000 } },
  { executor: dnsPropagationExecutor, definition: { id: "dns.propagation", name: "DNS Propagation", category: "dns", description: "Compare answers across resolvers.", inputSchema: domainInput, requiredPlan: "pro", risk: "passive", costUnits: 4, cacheTtlSeconds: 120, timeoutMs: 20000 } },
  { executor: dnsZoneExecutor, definition: { id: "dns.zone", name: "Zone Analysis", category: "dns", description: "Analyze SOA, NS, DNSSEC and common records.", inputSchema: domainInput, requiredPlan: "business", risk: "passive", costUnits: 4, cacheTtlSeconds: 1800, timeoutMs: 25000 } },
  { executor: networkPingExecutor, definition: { id: "network.ping", name: "Ping", category: "network", description: "Measure reachability and latency.", inputSchema: hostInput, requiredPlan: "free", risk: "active-safe", costUnits: 1, cacheTtlSeconds: 30, timeoutMs: 10000 } },
  { executor: networkTracerouteExecutor, definition: { id: "network.traceroute", name: "Traceroute", category: "network", description: "Trace network path to target.", inputSchema: hostInput, requiredPlan: "pro", risk: "active-safe", costUnits: 3, cacheTtlSeconds: 120, timeoutMs: 45000 } },
  { executor: networkAsnExecutor, definition: { id: "network.asn", name: "ASN Lookup", category: "network", description: "Resolve ASN and allocation metadata.", inputSchema: ipInput, requiredPlan: "free", risk: "passive", costUnits: 1, cacheTtlSeconds: 3600, timeoutMs: 10000 } },
  { executor: osintWhoisExecutor, definition: { id: "osint.whois", name: "WHOIS / RDAP", category: "osint", description: "Fetch registration and ownership metadata.", inputSchema: domainInput, requiredPlan: "free", risk: "passive", costUnits: 2, cacheTtlSeconds: 21600, timeoutMs: 20000 } },
  { executor: whoisFullExecutor, definition: { id: "whois.full", name: "WHOIS Full + History", category: "osint", description: "WHOIS con persistencia histórica automática, detección de cambios y análisis de expiración.", inputSchema: domainInput, requiredPlan: "free", risk: "passive", costUnits: 3, cacheTtlSeconds: 1800, timeoutMs: 25000 } },
  { executor: threatIpReputationExecutor, definition: { id: "threat.ip_reputation", name: "IP Reputation", category: "threat", description: "Enrich IP with reputation feeds.", inputSchema: ipInput, requiredPlan: "business", risk: "passive", costUnits: 4, cacheTtlSeconds: 900, timeoutMs: 15000 } },
  { executor: networkGeoIpExecutor, definition: { id: "network.geoip", name: "GeoIP", category: "network", description: "Locate IP geography and provider.", inputSchema: ipInput, requiredPlan: "free", risk: "passive", costUnits: 1, cacheTtlSeconds: 86400, timeoutMs: 8000 } },
  { executor: websiteTlsExecutor, definition: { id: "tls.scan", name: "TLS Scanner", category: "ssl-tls", description: "Inspect certificate chain and protocol posture.", inputSchema: hostInput, requiredPlan: "free", risk: "active-safe", costUnits: 2, cacheTtlSeconds: 1800, timeoutMs: 15000 } },
  { executor: websiteHeadersExecutor, definition: { id: "website.headers", name: "HTTP Headers", category: "website", description: "Fetch HTTP response headers safely.", inputSchema: urlInput, requiredPlan: "free", risk: "active-safe", costUnits: 1, cacheTtlSeconds: 300, timeoutMs: 12000 } },
  { executor: networkCdnExecutor, definition: { id: "network.cdn", name: "CDN Detection", category: "network", description: "Detect CDN from DNS and headers.", inputSchema: domainInput, requiredPlan: "pro", risk: "passive", costUnits: 2, cacheTtlSeconds: 1800, timeoutMs: 15000 } },
  { executor: networkWafExecutor, definition: { id: "network.waf", name: "WAF Detection", category: "network", description: "Passive WAF/provider detection.", inputSchema: urlInput, requiredPlan: "business", risk: "active-safe", costUnits: 3, cacheTtlSeconds: 1800, timeoutMs: 15000 } },
  { executor: networkReverseIpExecutor, definition: { id: "network.reverse_ip", name: "Reverse IP", category: "network", description: "Discover related hosts when provider allows.", inputSchema: ipInput, requiredPlan: "business", risk: "passive", costUnits: 5, cacheTtlSeconds: 21600, timeoutMs: 20000 } },
  { executor: networkBgpExecutor, definition: { id: "network.bgp", name: "BGP Analysis", category: "network", description: "Analyze prefix and route origin.", inputSchema: ipInput, requiredPlan: "enterprise", risk: "passive", costUnits: 4, cacheTtlSeconds: 900, timeoutMs: 20000 } },
  { executor: websiteSecurityHeadersExecutor, definition: { id: "website.security_headers", name: "Security Headers", category: "website", description: "Evaluate HSTS, CSP, XFO, referrer policy and more.", inputSchema: urlInput, requiredPlan: "free", risk: "active-safe", costUnits: 2, cacheTtlSeconds: 300, timeoutMs: 12000 } },
  { executor: technologyProfilerExecutor, definition: { id: "website.tech_stack", name: "Tech Stack Detection", category: "website", description: "Passive technology fingerprinting.", inputSchema: urlInput, requiredPlan: "pro", risk: "active-safe", costUnits: 3, cacheTtlSeconds: 1800, timeoutMs: 15000 } },
  { executor: websiteRedirectsExecutor, definition: { id: "website.redirects", name: "Redirect Analysis", category: "website", description: "Follow and score redirect chains.", inputSchema: urlInput, requiredPlan: "free", risk: "active-safe", costUnits: 2, cacheTtlSeconds: 300, timeoutMs: 15000 } },
  { executor: websiteCookiesExecutor, definition: { id: "website.cookies", name: "Cookie Analysis", category: "website", description: "Parse Set-Cookie flags.", inputSchema: urlInput, requiredPlan: "free", risk: "active-safe", costUnits: 2, cacheTtlSeconds: 300, timeoutMs: 12000 } },
  { executor: websiteCspExecutor, definition: { id: "website.csp", name: "CSP Analysis", category: "website", description: "Parse and score Content-Security-Policy.", inputSchema: urlInput, requiredPlan: "pro", risk: "active-safe", costUnits: 3, cacheTtlSeconds: 600, timeoutMs: 12000 } },
  { executor: websiteRobotsExecutor, definition: { id: "website.robots", name: "Robots.txt Analysis", category: "website", description: "Analyze robots.txt for sensitive paths.", inputSchema: urlInput, requiredPlan: "free", risk: "active-safe", costUnits: 1, cacheTtlSeconds: 300, timeoutMs: 12000 } },
  { executor: threatCustomIntelExecutor, definition: { id: "threat.custom_intel", name: "Custom Threat Intel", category: "threat", description: "Cross reference with custom private intel feeds.", inputSchema: domainInput, requiredPlan: "enterprise", risk: "passive", costUnits: 10, cacheTtlSeconds: 600, timeoutMs: 15000 } },
  { executor: tlsAdvancedExecutor, definition: { id: "tls.advanced", name: "TLS Advanced Analysis", category: "ssl-tls", description: "Deep SSL/TLS analysis: cipher suites, certificate chain, OCSP, ALPN, weak protocols.", inputSchema: hostInput, requiredPlan: "pro", risk: "active-safe", costUnits: 4, cacheTtlSeconds: 1800, timeoutMs: 25000 } },
  { executor: subdomainTakeoverExecutor, definition: { id: "network.subdomain_takeover", name: "Subdomain Takeover Detection", category: "network", description: "Detect subdomains vulnerable to takeover across 23+ cloud services.", inputSchema: hostInput, requiredPlan: "pro", risk: "active-safe", costUnits: 4, cacheTtlSeconds: 3600, timeoutMs: 20000 } },
  { executor: cveLookupExecutor, definition: { id: "threat.cve_lookup", name: "CVE Intelligence", category: "threat", description: "Query NVD API for known CVEs against detected technology stack.", inputSchema: hostInput, requiredPlan: "business", risk: "passive", costUnits: 5, cacheTtlSeconds: 21600, timeoutMs: 30000 } },
] as const satisfies readonly NativeToolSource[];

// ─── Definiciones sin executor (catálogo UI / getToolDefinition) ────────────

const ORPHAN_DEFINITIONS: NativeDefinition[] = [
  { id: "network.port_scan", name: "Port Scanner", category: "network", description: "Check approved ports for exposure.", inputSchema: hostInput.extend({ ports: z.array(z.number().int().min(1).max(65535)).max(20) }), requiredPlan: "business", risk: "active-intrusive", costUnits: 8, cacheTtlSeconds: 600, timeoutMs: 60000 },
  { id: "email.mail_health", name: "Mail Health", category: "email-security", description: "Composite email posture report.", inputSchema: domainInput, requiredPlan: "pro", risk: "passive", costUnits: 6, cacheTtlSeconds: 1800, timeoutMs: 45000 },
  { id: "email.smtp", name: "SMTP Diagnostics", category: "email-security", description: "SMTP handshake diagnostics without sending mail.", inputSchema: domainInput, requiredPlan: "business", risk: "active-safe", costUnits: 5, cacheTtlSeconds: 600, timeoutMs: 30000 },
  { id: "email.blacklists", name: "Blacklist Checks", category: "email-security", description: "DNSBL checks for domain/MX IPs.", inputSchema: domainInput, requiredPlan: "pro", risk: "passive", costUnits: 4, cacheTtlSeconds: 1800, timeoutMs: 30000 },
  { id: "email.bimi", name: "BIMI Analysis", category: "email-security", description: "BIMI TXT, logo and VMC posture.", inputSchema: domainInput, requiredPlan: "pro", risk: "passive", costUnits: 3, cacheTtlSeconds: 1800, timeoutMs: 15000 },
  { id: "email.score", name: "Email Security Score", category: "email-security", description: "Composite email score.", inputSchema: domainInput, requiredPlan: "pro", risk: "passive", costUnits: 8, cacheTtlSeconds: 1800, timeoutMs: 60000 },
  { id: "email.server_reputation", name: "Mail Server Reputation", category: "email-security", description: "Reputation for MX infrastructure.", inputSchema: domainInput, requiredPlan: "business", risk: "passive", costUnits: 5, cacheTtlSeconds: 1800, timeoutMs: 30000 },
  { id: "website.performance", name: "Performance Diagnostics", category: "website", description: "Lighthouse-style metrics and bottlenecks.", inputSchema: urlInput, requiredPlan: "business", risk: "active-safe", costUnits: 8, cacheTtlSeconds: 1800, timeoutMs: 90000 },
  { id: "website.fingerprint", name: "Fingerprinting", category: "website", description: "Collect passive application fingerprints.", inputSchema: urlInput, requiredPlan: "business", risk: "active-safe", costUnits: 4, cacheTtlSeconds: 1800, timeoutMs: 20000 },
];

// ─── Stores (única fuente mutable) ──────────────────────────────────────────

const executorStore = new Map<string, ToolExecutor>();
const definitionStore = new Map<string, IntelligenceToolDefinition>();
const pluginExecutorRegistry = new Map<string, ToolExecutor>();
const dynamicToolDefinitions: IntelligenceToolDefinition[] = [];

for (const t of NATIVE_TOOLS) {
  executorStore.set(t.definition.id, t.executor);
  definitionStore.set(t.definition.id, { ...t.definition, executor: t.executor.id });
}
for (const def of ORPHAN_DEFINITIONS) {
  definitionStore.set(def.id, { ...def, executor: def.id });
}

// ─── Tipos derivados (literal-id inference) ──────────────────────────────────

export type ToolId = (typeof NATIVE_TOOLS)[number]["definition"]["id"];
export type ExecutorRegistry = {
  [K in ToolId]: Extract<(typeof NATIVE_TOOLS)[number], { definition: { id: K } }>["executor"];
};
export type ToolInputMap = { [K in ToolId]: InferExecutorInput<ExecutorRegistry[K]> };
export type ToolOutputMap = { [K in ToolId]: InferExecutorOutput<ExecutorRegistry[K]> };
export type ToolInputs = ToolInputMap[ToolId];
export type ToolOutputs = ToolOutputMap[ToolId];

/**
 * Type guard: verifica si un toolId arbitrario (ej. del toolRegistry o de
 * entrada de usuario) corresponde a un executor nativo registrado.
 */
export function isKnownTool(toolId: string): toolId is ToolId {
  return executorStore.has(toolId);
}

/**
 * Entry point ÚNICO de mutación: registra (o actualiza) un tool completo —
 * executor + definition — con una sola llamada.
 * Es lo que usan plugins, custom tools y cualquier registro dinámico.
 *
 * Los tools dinámicos se resuelven DESPUÉS de los nativos (prioridad nativa):
 * si el id ya existe como tool nativo, se ignora con warning para no pisar
 * un built-in (ej. un plugin llamado "dns.lookup").
 */
export function registerTool(reg: ToolRegistration): void {
  if (isKnownTool(reg.definition.id)) {
    console.warn(`[ToolRegistry] Se ignora registro dinámico que colisiona con tool nativo: ${reg.definition.id}`);
    return;
  }
  pluginExecutorRegistry.set(reg.definition.id, reg.executor);
  const idx = dynamicToolDefinitions.findIndex((t) => t.id === reg.definition.id);
  if (idx >= 0) {
    dynamicToolDefinitions[idx] = reg.definition;
  } else {
    dynamicToolDefinitions.push(reg.definition);
  }
}

/**
 * Elimina un tool dinámico completo (executor + definition).
 * No afecta tools nativos.
 */
export function unregisterTool(id: string): void {
  pluginExecutorRegistry.delete(id);
  const idx = dynamicToolDefinitions.findIndex((t) => t.id === id);
  if (idx >= 0) dynamicToolDefinitions.splice(idx, 1);
}

/** Retorna el número de executors dinámicos registrados actualmente. */
export function getDynamicExecutorCount(): number {
  return pluginExecutorRegistry.size;
}

/** Retorna el número de tool definitions dinámicas registradas actualmente. */
export function getDynamicToolDefinitionCount(): number {
  return dynamicToolDefinitions.length;
}

/**
 * Retorna el executor para un toolId. Resuelve en orden:
 *   1. Native store (prioridad máxima) — 34 executors estáticos
 *   2. Plugin store — executors registrados dinámicamente por plugins
 */
export function getExecutor(toolId: string): ToolExecutor | undefined {
  return executorStore.get(toolId) ?? pluginExecutorRegistry.get(toolId);
}

/**
 * Retorna la definición de herramienta para un toolId. Resuelve en orden:
 *   1. Native store (incluye huérfanas de catálogo) — prioridad máxima
 *   2. Dynamic store — plugins + tools personalizados
 */
export function getToolDefinition(id: string): IntelligenceToolDefinition | undefined {
  return definitionStore.get(id) ?? dynamicToolDefinitions.find((t) => t.id === id);
}

/** Retorna TODAS las definiciones registradas (nativas + huérfanas + dinámicas). */
export function listToolDefinitions(): IntelligenceToolDefinition[] {
  return [...definitionStore.values(), ...dynamicToolDefinitions];
}
