import { z } from "zod";
import dns from "node:dns/promises";
import { assertPublicHostname, safeFetch } from "../security/egress-guard";
import { ToolExecutor, ExecutionContext, ExecutionResult, Finding, OsintWhoisOutput, RdapResponse, errMsg } from "../types/executor.types";
import { whoisCircuit, CircuitOpenError } from "../core/circuit-breaker";
import { geoipCache, IntelligenceCache } from "../core/cache";
import { persistWhoisSnapshot } from "../history/whois-history";
import type { WhoisSnapshot } from "../history/types";
import { logger } from "@/lib/logger";

const domainSchema = z.object({ domain: z.string().min(3).max(253) });

/**
 * OSINT WHOIS / RDAP Executor
 */
export const osintWhoisExecutor: ToolExecutor<{ domain: string }, OsintWhoisOutput> = {
  id: "osint.whois",
  timeoutMs: 20000,
  category: "osint",
  validate(input: unknown) {
    return domainSchema.parse(input);
  },
  async execute(ctx: ExecutionContext, { domain }): Promise<ExecutionResult<OsintWhoisOutput>> {
    ctx.log(`Iniciando consulta OSINT RDAP para: ${domain}`);
    await assertPublicHostname(domain);

    let rdapData: RdapResponse | null = null;
    try {
      // Verificar caché antes de llamar a la API RDAP
      const cacheKey = IntelligenceCache.buildKey("rdap", domain);
      const cachedRdap = geoipCache.get<RdapResponse>(cacheKey);

      if (cachedRdap) {
        rdapData = cachedRdap;
        ctx.log(`RDAP recuperado desde caché para: ${domain}`);
      } else {
        rdapData = await whoisCircuit.execute(async () => {
          const res = await safeFetch(`https://rdap.org/domain/${domain}`);
          if (!res.ok) throw new Error(`RDAP HTTP ${res.status}`);
          return res.json();
        });
        // Cachear resultado 30 minutos (datos WHOIS son muy estables)
        geoipCache.set(cacheKey, rdapData, 30 * 60 * 1000);
      }
    } catch (e: unknown) {
      if (e instanceof CircuitOpenError) {
        ctx.log(`Circuito WHOIS/RDAP abierto: ${e.message}. Usando estimación local.`);
      } else {
        ctx.log(`Error consumiendo API RDAP pública: ${errMsg(e)}`);
      }
    }

    const findings: Finding[] = [];

    if (!rdapData) {
      // Task 8 (2026-10-11): antes este camino devolvía un WHOIS INVENTADO
      // (registrador ficticio, alta hace 5 años, expiración en 90 días y
      // nameservers de relleno) y lo PERSISTÍA en `whois_history` como si fuera
      // un snapshot real, con el riesgo añadido de disparar alertas de "cambio
      // WHOIS" sobre datos que nunca existieron. Sin RDAP no hay registro: no se
      // emite estimación y no se escribe nada.
      ctx.log("RDAP no disponible: no se emite ni se persiste ningún dato WHOIS.");
      return {
        success: false,
        output: {
          success: false,
          domain,
          registrar: "",
          createdDate: null,
          updatedDate: null,
          expiresDate: null,
          daysRemaining: null,
          status: [],
          nameservers: [],
        },
        findings: [],
        error:
          "RDAP_UNAVAILABLE: no se pudo consultar el registro RDAP del dominio. " +
          "No se emite estimación ni se persiste historial.",
      };
    }

    // Parsea eventos clave de la respuesta estándar RDAP (RFC 7483)
    const events = rdapData.events || [];
    let createdAt: string | null = null;
    let expiresAt: string | null = null;
    let updatedAt: string | null = null;

    for (const event of events) {
      const action = event.eventAction;
      const date = event.eventDate;
      if (action === "registration") {
        createdAt = date;
      } else if (action === "expiration") {
        expiresAt = date;
      } else if (action === "last changed") {
        updatedAt = date;
      }
    }

    // Task 8 (2026-10-11): si RDAP no trae un evento, el dato es DESCONOCIDO.
    // Antes se inventaban alta hace 1 año y expiración en 180 días (y de ahí
    // salía un daysRemaining y un finding de "expiración" ficticios).
    if (!updatedAt) updatedAt = createdAt;

    const daysRemaining = expiresAt
      ? Math.round((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;

    // Buscar el Registrador
    const entities = rdapData.entities || [];
    let registrar = "Desconocido";
    for (const entity of entities) {
      if (entity.roles && entity.roles.includes("registrar")) {
        const vcard = entity.vcardArray;
        if (vcard && vcard[1]) {
          const fn = vcard[1].find((item) => item[0] === "fn");
          if (fn) {
            registrar = fn[3] ?? "Desconocido";
          }
        }
      }
    }

    // Obtener Nameservers desde RDAP o vía resolución DNS directa
    let nameservers: string[] = [];
    if (rdapData.nameservers) {
      nameservers = rdapData.nameservers.map((ns) => ns.ldhName ?? "").filter(Boolean);
    }
    if (nameservers.length === 0) {
      // El fallback a DNS directo es real (consulta NS); si tampoco responde,
      // el resultado honesto es [] — antes se rellenaba con ns1/ns2.host.com.
      try {
        nameservers = await dns.resolve(domain, "NS");
      } catch {
        nameservers = [];
      }
    }

    const output = {
      success: true, // Crucial para la UI
      domain,
      registrar,
      createdDate: createdAt,
      updatedDate: updatedAt,
      expiresDate: expiresAt,
      daysRemaining,
      status: rdapData.status || [],
      nameservers,
    };

    if (daysRemaining !== null && daysRemaining < 30 && daysRemaining > 0) {
      findings.push({
        severity: "high",
        confidence: 0.99,
        title: `Expiración de Registro de Dominio Inminente (${daysRemaining} días)`,
        description: `El dominio corporativo principal ${domain} expira en apenas ${daysRemaining} días. Si el dominio no se renueva a tiempo, los nameservers dejarán de resolver, tumbando correos y servicios web globalmente.`,
        recommendation: "Acceda de inmediato al panel de su Registrador oficial de dominios y autorice la renovación inmediata.",
        affectedAsset: domain,
        evidence: { expiresAt, daysRemaining },
      });
    }

    ctx.log(`Consulta OSINT RDAP completada. Registrador: ${registrar}, Expiración: ${expiresAt}`);

    // Persistir snapshot histórico (fire-and-forget). Sólo con datos reales de
    // RDAP: las fechas ausentes quedan null (nunca se fabrica "hoy - 1 año").
    const historySnapshot: WhoisSnapshot = {
      domain,
      registrar,
      createdDate: createdAt ? new Date(createdAt) : null,
      expiresDate: expiresAt ? new Date(expiresAt) : null,
      updatedDate: updatedAt ? new Date(updatedAt) : null,
      status: rdapData.status || [],
      nameservers,
      abuseContact: null,
      registrantOrg: null,
      originalData: rdapData as Record<string, unknown>,
    };
    persistWhoisSnapshot(ctx.projectId, ctx.investigationId, historySnapshot)
      .then((result) => {
        if (result.changes.length > 0) {
          ctx.log(`[OSINT WHOIS] Cambios detectados en ${domain}: ${result.changes.map(c => `${c.label} (${c.severity})`).join(', ')}`);
        }
      })
      .catch((err) => logger.error(`[OSINT WHOIS] Error history para ${domain}:`, err));

    return { success: true, output, findings };
  },
};
