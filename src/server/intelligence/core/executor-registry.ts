import { ToolExecutor } from "../types/executor.types";
import { dnsLookupExecutor, dnsMxExecutor, dnsTxtExecutor, dnsNsExecutor } from "../executors/dns-executors";
import { emailSpfExecutor, emailDmarcExecutor, emailDkimExecutor } from "../executors/email-executors";
import {
  networkPingExecutor,
  networkReverseDnsExecutor,
  networkGeoIpExecutor,
  networkTracerouteExecutor,
  networkAsnExecutor,
  networkCdnExecutor,
  networkWafExecutor,
  networkReverseIpExecutor,
  threatIpReputationExecutor
} from "../executors/network-executors";
import {
  websiteHeadersExecutor,
  websiteSecurityHeadersExecutor,
  websiteTlsExecutor,
  websiteRobotsExecutor
} from "../executors/website-executors";
import { osintWhoisExecutor } from "../executors/osint-executors";
import { technologyProfilerExecutor } from "../executors/technology-profiler";
import { networkBgpExecutor, threatCustomIntelExecutor } from "../executors/advanced-executors";
import { whoisFullExecutor } from "../executors/whois-executors";
import { tlsAdvancedExecutor } from "../executors/tls-advanced";
import { subdomainTakeoverExecutor } from "../executors/subdomain-takeover";
import { cveLookupExecutor } from "../executors/cve-lookup";

export const executorRegistry: Record<string, ToolExecutor> = {
  "dns.lookup": dnsLookupExecutor,
  "dns.mx": dnsMxExecutor,
  "dns.txt": dnsTxtExecutor,
  "dns.ns": dnsNsExecutor,
  "email.spf": emailSpfExecutor,
  "email.dmarc": emailDmarcExecutor,
  "email.dkim": emailDkimExecutor,
  "network.ping": networkPingExecutor,
  "network.reverse_dns": networkReverseDnsExecutor,
  "network.geoip": networkGeoIpExecutor,
  "network.traceroute": networkTracerouteExecutor,
  "network.asn": networkAsnExecutor,
  "network.cdn": networkCdnExecutor,
  "network.waf": networkWafExecutor,
  "network.reverse_ip": networkReverseIpExecutor,
  "threat.ip_reputation": threatIpReputationExecutor,
  "website.headers": websiteHeadersExecutor,
  "website.security_headers": websiteSecurityHeadersExecutor,
  "tls.scan": websiteTlsExecutor,
  "website.robots": websiteRobotsExecutor,
  "website.tech_stack": technologyProfilerExecutor,
  "osint.whois": osintWhoisExecutor,
  "whois.full": whoisFullExecutor,
  "network.bgp": networkBgpExecutor,
  "threat.custom_intel": threatCustomIntelExecutor,
  "tls.advanced": tlsAdvancedExecutor,
  "network.subdomain_takeover": subdomainTakeoverExecutor,
  "threat.cve_lookup": cveLookupExecutor,
};

// ─── Dynamic (Plugin) Executor Registry ─────────────────────────────────────

const pluginExecutorRegistry = new Map<string, ToolExecutor>();

/**
 * Registra un executor dinámico (ej. de Plugin Marketplace) en el registro.
 * Los executors dinámicos se resuelven DESPUÉS de los nativos en getExecutor().
 */
export function registerDynamicExecutor(id: string, executor: ToolExecutor): void {
  pluginExecutorRegistry.set(id, executor);
}

/**
 * Elimina un executor dinámico del registro.
 */
export function unregisterDynamicExecutor(id: string): void {
  pluginExecutorRegistry.delete(id);
}

/**
 * Retorna el número de executors dinámicos registrados actualmente.
 */
export function getDynamicExecutorCount(): number {
  return pluginExecutorRegistry.size;
}

export function getExecutor(toolId: string): ToolExecutor | undefined {
  // 1. Static (nativo) registry — más rápido para herramientas core
  if (executorRegistry[toolId]) return executorRegistry[toolId];
  // 2. Dynamic (plugin) registry — herramientas instaladas por el usuario
  return pluginExecutorRegistry.get(toolId);
}
