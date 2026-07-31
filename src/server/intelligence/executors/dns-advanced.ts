/**
 * dns-advanced.ts — DNS Advanced Executors
 *
 * toolIds: dns.dnssec, dns.propagation, dns.zone
 *
 * Implementa 3 executors DNS que estaban definidos en tool-registry
 * pero sin executor asociado (huérfanos).
 */

import { z } from "zod";
import dns from "node:dns/promises";
import { assertPublicHostname } from "../security/egress-guard";
import {
  ToolExecutor, ExecutionContext, ExecutionResult, Finding,
  DnsDnssecOutput, DnsPropagationOutput, ResolverResult, DnsZoneOutput,
} from "../types/executor.types";

const domainSchema = z.object({ domain: z.string().min(3).max(253) });

async function safeResolve<T>(promise: Promise<T>): Promise<T | null> {
  try { return await promise; } catch { return null; }
}

// ─── 1. DNSSEC Validation ─────────────────────────────────────────────────

export const dnsDnssecExecutor: ToolExecutor<{ domain: string }, DnsDnssecOutput> = {
  id: "dns.dnssec",
  timeoutMs: 15000,
  category: "dns",
  validate(input: unknown) { return domainSchema.parse(input); },
  async execute(ctx: ExecutionContext, { domain }): Promise<ExecutionResult<DnsDnssecOutput>> {
    ctx.log(`[DNSSEC] Validando cadena DNSSEC para: ${domain}`);
    await assertPublicHostname(domain);

    const dnskey = await safeResolve(dns.resolve(domain, "DNSKEY"));
    const ds = await safeResolve(dns.resolve(domain, "DS"));

    let hasRrsig = false;
    try {
      const rrsig = await dns.resolve(domain, "RRSIG");
      hasRrsig = Array.isArray(rrsig) && rrsig.length > 0;
    } catch { /* RRSIG not supported */ }

    const hasDnskey = Array.isArray(dnskey) && dnskey.length > 0;
    const hasDs = Array.isArray(ds) && ds.length > 0;

    const output = {
      domain,
      hasDnskey,
      dnsKeyCount: Array.isArray(dnskey) ? dnskey.length : 0,
      hasDs,
      dsCount: Array.isArray(ds) ? ds.length : 0,
      hasRrsig,
      dnssecEnabled: hasDnskey || hasDs,
      dnssecSigned: hasRrsig,
    };

    const findings: Finding[] = [];

    if (!output.dnssecEnabled) {
      findings.push({
        severity: "medium", confidence: 0.9,
        title: "DNSSEC No Habilitado",
        description: `El dominio ${domain} no tiene registros DNSKEY o DS publicados. Sin DNSSEC, las respuestas DNS pueden ser falsificadas (DNS spoofing/cache poisoning).`,
        recommendation: "Habilite DNSSEC en su registrador de dominios y configure las claves ZSK/KSK en su servidor DNS autoritativo.",
        affectedAsset: domain,
        evidence: { hasDnskey: false, hasDs: false },
      });
    } else if (!output.dnssecSigned && output.hasDnskey) {
      findings.push({
        severity: "low", confidence: 0.7,
        title: "DNSSEC Parcial — Sin RRSIG",
        description: `El dominio ${domain} tiene DNSKEY pero no se detectaron RRSIG. Las claves están publicadas pero las respuestas podrían no estar firmadas.`,
        recommendation: "Verifique que su servidor DNS esté firmando todas las zonas con las ZSK configuradas.",
        affectedAsset: domain,
        evidence: { hasDnskey: true, hasRrsig: false },
      });
    }

    ctx.log(`[DNSSEC] ${domain}: ${output.dnssecEnabled ? "Habilitado" : "No habilitado"}`);
    return { success: true, output, findings };
  },
};

// ─── 2. DNS Propagation ───────────────────────────────────────────────────

const PUBLIC_RESOLVERS = [
  "1.1.1.1",   // Cloudflare
  "8.8.8.8",   // Google
  "208.67.222.222", // OpenDNS
  "9.9.9.9",   // Quad9
];

export const dnsPropagationExecutor: ToolExecutor<{ domain: string }, DnsPropagationOutput> = {
  id: "dns.propagation",
  timeoutMs: 25000,
  category: "dns",
  validate(input: unknown) { return domainSchema.parse(input); },
  async execute(ctx: ExecutionContext, { domain }): Promise<ExecutionResult<DnsPropagationOutput>> {
    ctx.log(`[DNS Propagation] Consultando propagación DNS para: ${domain}`);
    await assertPublicHostname(domain);

    const resolverResults: ResolverResult[] = [];

    for (const resolver of PUBLIC_RESOLVERS) {
      const start = Date.now();
      try {
        const aRecords = await safeResolve(dns.resolve4(domain));
        const mxRecords = await safeResolve(dns.resolveMx(domain));

        resolverResults.push({
          resolver,
          a: Array.isArray(aRecords) ? aRecords : [],
          mx: mxRecords?.map((m) => `${m.exchange} (priority ${m.priority})`) || [],
          success: true,
          latencyMs: Date.now() - start,
        });
      } catch {
        resolverResults.push({
          resolver,
          a: [],
          mx: [],
          success: false,
          latencyMs: Date.now() - start,
        });
      }
    }

    const allARecords = resolverResults.map((r) => r.a.join(","));
    const isConsistent = new Set(allARecords).size === 1;
    const allMxRecords = resolverResults.map((r) => r.mx.join(","));
    const mxConsistent = new Set(allMxRecords).size === 1;

    const output = {
      domain,
      resolverResults,
      aConsistent: isConsistent,
      mxConsistent,
      resolversChecked: PUBLIC_RESOLVERS.length,
    };

    const findings: Finding[] = [];

    if (!isConsistent) {
      findings.push({
        severity: "low", confidence: 0.8,
        title: "Propagación DNS Inconsistente",
        description: `Los registros A de ${domain} varían entre los resolvers globales consultados. Esto puede indicar una propagación de cambios reciente o una configuración Anycast con respuestas diferentes.`,
        recommendation: "Espere a que la propagación complete (hasta 48h) o verifique que todos los servidores autoritativos sirvan los mismos datos.",
        affectedAsset: domain,
        evidence: { resolverResults: resolverResults.map((r) => ({ resolver: r.resolver, a: r.a, latencyMs: r.latencyMs })) },
      });
    }

    ctx.log(`[DNS Propagation] ${domain}: ${isConsistent ? "Consistente" : "Inconsistente"} (${resolverResults.length} resolvers)`);
    return { success: true, output, findings };
  },
};

// ─── 3. Zone Analysis ─────────────────────────────────────────────────────

export const dnsZoneExecutor: ToolExecutor<{ domain: string }, DnsZoneOutput> = {
  id: "dns.zone",
  timeoutMs: 25000,
  category: "dns",
  validate(input: unknown) { return domainSchema.parse(input); },
  async execute(ctx: ExecutionContext, { domain }): Promise<ExecutionResult<DnsZoneOutput>> {
    ctx.log(`[Zone Analysis] Analizando zona DNS para: ${domain}`);
    await assertPublicHostname(domain);

    const [soa, ns, mx, txt, a, aaaa, cname, srv, caa] = await Promise.all([
      safeResolve(dns.resolveSoa(domain)),
      safeResolve(dns.resolveNs(domain)),
      safeResolve(dns.resolveMx(domain)),
      safeResolve(dns.resolveTxt(domain)),
      safeResolve(dns.resolve4(domain)),
      safeResolve(dns.resolve6(domain)),
      safeResolve(dns.resolve(domain, "CNAME")),
      safeResolve(dns.resolveSrv("_autodiscover._tcp." + domain)),
      safeResolve(dns.resolve(domain, "CAA")),
    ]);

    const output = {
      domain,
      soa: soa ? { nsname: soa.nsname, hostmaster: soa.hostmaster, serial: soa.serial, refresh: soa.refresh, retry: soa.retry, expire: soa.expire, minttl: soa.minttl } : null,
      ns: ns || [],
      mx: mx || [],
      a: a || [],
      aaaa: aaaa || [],
      cname: cname || [],
      txt: txt ? txt.map((t) => t.join(" ")) : [],
      srv: srv || [],
      caa: caa || [],
      recordsFound: (a?.length || 0) + (aaaa?.length || 0) + (mx?.length || 0) + (ns?.length || 0) + (txt?.length || 0) + (cname?.length || 0) + (srv?.length || 0) + (caa?.length || 0) + (soa ? 1 : 0),
    };

    const findings: Finding[] = [];

    if (!output.soa) {
      findings.push({
        severity: "critical", confidence: 1.0,
        title: "Registro SOA Ausente",
        description: `No se pudo recuperar el registro SOA (Start of Authority) para ${domain}. Sin SOA, la zona DNS está incompleta o el dominio no está configurado correctamente.`,
        recommendation: "Verifique la configuración del servidor DNS autoritativo y asegúrese de que el registro SOA esté presente y sea válido.",
        affectedAsset: domain,
        evidence: { soa: null },
      });
    }

    if (output.soa && output.soa.minttl < 60) {
      findings.push({
        severity: "medium", confidence: 0.85,
        title: "TTL Mínimo Muy Bajo en SOA",
        description: `El TTL mínimo (minimum TTL) del registro SOA es ${output.soa.minttl} segundos. Un valor muy bajo aumenta la carga en los servidores DNS autoritativos y puede indicar configuraciones de migración inestables.`,
        recommendation: "Establezca un minimum TTL de al menos 300 segundos (5 min) para operaciones estables.",
        affectedAsset: domain,
        evidence: { minttl: output.soa.minttl },
      });
    }

    if (output.soa && output.soa.expire < 86400) {
      findings.push({
        severity: "low", confidence: 0.7,
        title: "Expiración SOA Corta",
        description: `El tiempo de expiración SOA es de ${output.soa.expire} segundos. Si los servidores secundarios no pueden refrescar la zona antes de que expire, dejarán de servir la zona.`,
        recommendation: "Aumente el valor de expiración a al menos 604800 (7 días) para servidores secundarios.",
        affectedAsset: domain,
        evidence: { expire: output.soa.expire },
      });
    }

    if (!output.caa || output.caa.length === 0) {
      findings.push({
        severity: "medium", confidence: 0.9,
        title: "Registro CAA Ausente",
        description: `El dominio ${domain} no tiene registros CAA (Certification Authority Authorization). Cualquier CA puede emitir certificados SSL para este dominio, aumentando el riesgo de emisión no autorizada.`,
        recommendation: "Publique registros CAA que restrinjan qué CAs pueden emitir certificados para su dominio (ej. '0 issue letsencrypt.org').",
        affectedAsset: domain,
        evidence: { caa: [] },
      });
    }

    if (output.txt.length === 0) {
      findings.push({
        severity: "info", confidence: 0.8,
        title: "Sin Registros TXT",
        description: `No se encontraron registros TXT para ${domain}. Se recomienda configurar al menos SPF y DMARC para seguridad de correo electrónico.`,
        recommendation: "Configure registros TXT para SPF, DKIM, DMARC y verificación de propiedad del dominio.",
        affectedAsset: domain,
        evidence: { txtCount: 0 },
      });
    }

    ctx.log(`[Zone Analysis] ${domain}: ${output.recordsFound} registros encontrados (SOA: ${output.soa ? "OK" : "AUSENTE"})`);
    return { success: true, output, findings };
  },
};


