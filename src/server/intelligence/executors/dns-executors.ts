import { z } from "zod";
import dns from "node:dns/promises";
import { assertPublicHostname } from "../security/egress-guard";
import { ToolExecutor, ExecutionContext, ExecutionResult, Finding } from "../types/executor.types";

const domainSchema = z.object({ domain: z.string().min(3).max(253) });

// Helper para encapsular resoluciones DNS controlando errores individuales
async function safeResolve<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

/**
 * 1. DNS Lookup Executor
 */
export const dnsLookupExecutor: ToolExecutor<{ domain: string }, any> = {
  id: "dns.lookup",
  timeoutMs: 8000,
  category: "dns",
  validate(input: unknown) {
    return domainSchema.parse(input);
  },
  async execute(ctx: ExecutionContext, { domain }): Promise<ExecutionResult<any>> {
    ctx.log(`Iniciando DNS Lookup seguro para: ${domain}`);
    await assertPublicHostname(domain);

    const [a, aaaa, mx, ns, txt, soa] = await Promise.all([
      safeResolve(dns.resolve4(domain)),
      safeResolve(dns.resolve6(domain)),
      safeResolve(dns.resolveMx(domain)),
      safeResolve(dns.resolveNs(domain)),
      safeResolve(dns.resolveTxt(domain)),
      safeResolve(dns.resolveSoa(domain)),
    ]);

    const output = {
      domain,
      a: a || [],
      aaaa: aaaa || [],
      mx: mx || [],
      ns: ns || [],
      txt: txt ? txt.map((t) => t.join(" ")) : [],
      soa: soa || null,
    };

    const findings: Finding[] = [];

    if (!a || a.length === 0) {
      findings.push({
        severity: "high",
        confidence: 0.95,
        title: "Ausencia de Direccionamiento IPv4 (Registro A)",
        description: `El dominio ${domain} no contiene ningún registro DNS tipo A activo. Esto impedirá que clientes heredados o redes solo IPv4 puedan establecer conexiones con su infraestructura web.`,
        recommendation: "Añada al menos un registro A apuntando a la IP pública balanceada de su servidor web principal.",
        affectedAsset: domain,
        evidence: { domain, hasA: false },
      });
    }

    if (!ns || ns.length === 0) {
      findings.push({
        severity: "critical",
        confidence: 1.0,
        title: "Nameservers No Configurados",
        description: `No se resolvieron servidores de nombres (NS) autoritativos para el dominio ${domain}. Esto significa que el dominio está desconectado y no es capaz de resolver ninguna petición.`,
        recommendation: "Configure de inmediato los servidores DNS delegados en su registrador de dominios oficial (Registrar).",
        affectedAsset: domain,
        evidence: { nsMissing: true },
      });
    }

    ctx.log(`DNS Lookup finalizado. Registros IPv4: ${output.a.length}, Registros IPv6: ${output.aaaa.length}`);
    return { success: true, output, findings };
  },
};

/**
 * 2. DNS MX Executor
 */
export const dnsMxExecutor: ToolExecutor<{ domain: string }, any> = {
  id: "dns.mx",
  timeoutMs: 8000,
  category: "dns",
  validate(input: unknown) {
    return domainSchema.parse(input);
  },
  async execute(ctx: ExecutionContext, { domain }): Promise<ExecutionResult<any>> {
    ctx.log(`Iniciando DNS MX Lookup seguro para: ${domain}`);
    await assertPublicHostname(domain);

    const mxRecords = await safeResolve(dns.resolveMx(domain));
    const output = {
      domain,
      records: mxRecords || [],
    };

    const findings: Finding[] = [];

    if (!mxRecords || mxRecords.length === 0) {
      findings.push({
        severity: "medium",
        confidence: 0.9,
        title: "Servidor de Correo (MX) Inexistente",
        description: `El dominio ${domain} no define registros DNS MX. Ningún servidor de correo externo podrá enviarle mensajes, devolviendo errores de rebote inmediatos.`,
        recommendation: "Si este dominio está destinado a recibir correspondencia, añada registros MX con sus respectivas prioridades (ej. Google Workspace, M365).",
        affectedAsset: domain,
        evidence: { recordsCount: 0 },
      });
    }

    return { success: true, output, findings };
  },
};

/**
 * 3. DNS TXT Executor
 */
export const dnsTxtExecutor: ToolExecutor<{ domain: string }, any> = {
  id: "dns.txt",
  timeoutMs: 8000,
  category: "dns",
  validate(input: unknown) {
    return domainSchema.parse(input);
  },
  async execute(ctx: ExecutionContext, { domain }): Promise<ExecutionResult<any>> {
    ctx.log(`Iniciando DNS TXT Lookup seguro para: ${domain}`);
    await assertPublicHostname(domain);

    const txtRecords = await safeResolve(dns.resolveTxt(domain));
    const flatRecords = txtRecords ? txtRecords.map((t) => t.join(" ")) : [];

    const output = {
      domain,
      records: flatRecords,
    };

    const findings: Finding[] = [];

    // Clasificar registros interesantes (SPF, de verificación, etc.)
    const spfRecords = flatRecords.filter((r) => r.toLowerCase().startsWith("v=spf1"));
    if (spfRecords.length > 1) {
      findings.push({
        severity: "high",
        confidence: 1.0,
        title: "Múltiples Registros SPF Detectados",
        description: `Se detectaron ${spfRecords.length} registros SPF válidos para ${domain}. Según la RFC 7208, un dominio no debe tener más de un registro SPF, de lo contrario los servidores de destino descartarán ambos registros y tratarán el SPF como inválido (PermError).`,
        recommendation: "Fusione ambos registros SPF en una única línea combinando los mecanismos e inclusiones.",
        affectedAsset: domain,
        evidence: { spfRecords },
      });
    }

    return { success: true, output, findings };
  },
};

/**
 * 4. DNS NS Executor
 */
export const dnsNsExecutor: ToolExecutor<{ domain: string }, any> = {
  id: "dns.ns",
  timeoutMs: 8000,
  category: "dns",
  validate(input: unknown) {
    return domainSchema.parse(input);
  },
  async execute(ctx: ExecutionContext, { domain }): Promise<ExecutionResult<any>> {
    ctx.log(`Iniciando DNS NS Lookup seguro para: ${domain}`);
    await assertPublicHostname(domain);

    const nsRecords = await safeResolve(dns.resolveNs(domain));
    const output = {
      domain,
      servers: nsRecords || [],
    };

    const findings: Finding[] = [];

    if (nsRecords && nsRecords.length === 1) {
      findings.push({
        severity: "medium",
        confidence: 0.9,
        title: "Punto Único de Fallo en Servidores DNS (Single Nameserver)",
        description: `El dominio ${domain} solo está delegado a un único servidor DNS (${nsRecords[0]}). Si dicho servidor experimenta un ataque de denegación de servicio (DDoS) o una desconexión, toda su infraestructura web y de correo quedará inaccesible globalmente.`,
        recommendation: "Agregue al menos un servidor secundario DNS de nombres (NS) secundario en una subred o proveedor redundante.",
        affectedAsset: domain,
        evidence: { servers: nsRecords },
      });
    }

    return { success: true, output, findings };
  },
};
