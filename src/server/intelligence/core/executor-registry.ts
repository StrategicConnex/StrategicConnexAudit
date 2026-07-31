import { ToolExecutor } from "../types/executor.types";

// ─── Static (Manual) Executor Registry ───────────────────────────────────
// Los executors manuales se definen AQUÍ y tienen prioridad sobre los
// auto-descubiertos. Esto mantiene compatibilidad con los executors existentes
// mientras que los nuevos pueden auto-registrarse via loader + auto-register.
//
// Para agregar un executor manual: importar + agregar al objeto executorRegistry.
// Para crear un executor auto-descubrible: crear archivo en executors/ con
// export const executor: ToolExecutor = { ... } export const definition = { ... }

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
  "website.redirects": websiteRedirectsExecutor,
  "website.cookies": websiteCookiesExecutor,
  "website.csp": websiteCspExecutor,
  "website.tech_stack": technologyProfilerExecutor,
  "osint.whois": osintWhoisExecutor,
  "whois.full": whoisFullExecutor,
  "network.bgp": networkBgpExecutor,
  "threat.custom_intel": threatCustomIntelExecutor,
  "dns.dnssec": dnsDnssecExecutor,
  "dns.propagation": dnsPropagationExecutor,
  "dns.zone": dnsZoneExecutor,
  "tls.advanced": tlsAdvancedExecutor,
  "network.subdomain_takeover": subdomainTakeoverExecutor,
  "threat.cve_lookup": cveLookupExecutor,
};

// ─── Dynamic (Plugin & Auto-discovered) Executor Registry ─────────────────

const pluginExecutorRegistry = new Map<string, ToolExecutor>();
let autoInitDone = false;

/**
 * Inicializa executors auto-descubiertos — ejecutado UNA VEZ en el primer
 * acceso a getExecutor(). Escanea el directorio executors/ en busca de
 * archivos que exporten `executor` (ToolExecutor) y los registra en el
 * registro dinámico.
 */
async function ensureAutoExecutorsInitialized(): Promise<void> {
  if (autoInitDone) return;
  autoInitDone = true;

  try {
    const { discoverExecutors } = await import("../executors/loader");
    const { registerExecutor } = await import("./auto-register");

    const discovered = await discoverExecutors();
    for (const entry of discovered) {
      // Solo registrar si NO existe ya en el registro manual
      if (!executorRegistry[entry.executor.id]) {
        registerExecutor(entry.executor, entry.definition);
      }
    }

    if (discovered.length > 0) {
      console.log(`[ExecutorRegistry] Auto-descubiertos: ${discovered.length} executor(es)`);
    }
  } catch (err) {
    // Fallback silencioso — los executors manuales siguen funcionando
    console.warn("[ExecutorRegistry] Auto-discovery no disponible:", (err as Error).message);
  }
}

/**
 * Registra un executor dinámico (ej. de Plugin Marketplace o auto-descubierto).
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

let pendingInit: Promise<void> | null = null;

/**
 * Retorna el executor para un toolId.
 * Resuelve en orden:
 *   1. Registro manual (executorRegistry) — prioridad máxima
 *   2. Registro dinámico (plugin + auto-descubrimiento)
 *
 * En el primer acceso, inicializa automáticamente los executors
 * auto-descubiertos. Esto ocurre transparentemente sin afectar la
 * respuesta — los executors manuales están disponibles de inmediato.
 */
export function getExecutor(toolId: string): ToolExecutor | undefined {
  // 1. Static (nativo) registry — más rápido para herramientas core
  if (executorRegistry[toolId]) return executorRegistry[toolId];
  // 2. Inicializar auto-descubrimiento lazy en background si no se hizo aún
  if (!autoInitDone) {
    if (!pendingInit) {
      pendingInit = ensureAutoExecutorsInitialized();
    }
    // No await — la inicialización corre en background
    // Los executors manuales están disponibles de inmediato
  }
  // 3. Dynamic (plugin + auto) registry — herramientas instaladas o descubiertas
  return pluginExecutorRegistry.get(toolId);
}

/**
 * Fuerza la inicialización de auto-descubrimiento (útil para tests).
 */
export async function forceInitAutoExecutors(): Promise<void> {
  if (!autoInitDone) {
    await ensureAutoExecutorsInitialized();
  }
}
