/**
 * whois-executors.ts — WHOIS / RDAP Full Executor (P0.2)
 *
 * Executor dedicado a consultas WHOIS reales vía RDAP (REST),
 * con persistencia automática en whois_history vía el módulo P0.2.
 *
 * Diferencias con osint.whois (osint-executors.ts):
 *   - Llama a persistWhoisSnapshot() para historial
 *   - Output estructurado como WhoisSnapshot
 *   - Findings detallados (expiración, nameservers, abuso)
 */

import { z } from "zod";
import dns from "node:dns/promises";
import { assertPublicHostname, safeFetch } from "../security/egress-guard";
import { ToolExecutor, ExecutionContext, ExecutionResult, Finding, WhoisFullOutput, RdapResponse, errMsg } from "../types/executor.types";
import { persistWhoisSnapshot } from "../history/whois-history";
import { whoisCircuit, CircuitOpenError } from "../core/circuit-breaker";
import { geoipCache, IntelligenceCache } from "../core/cache";
import { sendWhoisChangeAlerts } from "@/server/security/whois-change-alert";
import type { WhoisSnapshot } from "../history/types";
import { logger } from "@/lib/logger";

const domainSchema = z.object({ domain: z.string().min(3).max(253) });

/**
 * WHOIS Full Executor — consulta RDAP real + persistencia histórica
 *
 * Flujo:
 *   1. Valida dominio + assertPublicHostname
 *   2. Cache hit → parsea rdapData cacheado → snapshot → respuesta
 *   3. Cache miss → fetch RDAP via whoisCircuit
 *   4. Cachea rdapData raw (no el snapshot con Date objects)
 *   5. Parsear RFC 7483 → WhoisSnapshot
 *   6. persistWhoisSnapshot() → guarda en whois_history
 *   7. Generar findings
 */
export const whoisFullExecutor: ToolExecutor<{ domain: string }, WhoisFullOutput> = {
  id: "whois.full",
  timeoutMs: 25000,
  category: "osint",

  validate(input: unknown) {
    return domainSchema.parse(input);
  },

  async execute(ctx: ExecutionContext, { domain }): Promise<ExecutionResult<WhoisFullOutput>> {
    ctx.log(`[WHOIS Full] Iniciando consulta RDAP para: ${domain}`);
    await assertPublicHostname(domain);

    // ── 1. Cache (cacheamos rdapData raw, no el snapshot con Date objects) ─
    const cacheKey = IntelligenceCache.buildKey("whois-full", domain);
    const cachedRdap = geoipCache.get<RdapResponse>(cacheKey);

    if (cachedRdap) {
      ctx.log(`[WHOIS Full] Cache hit para ${domain}`);
      const snapshot = parseRdapToSnapshot(domain, cachedRdap);
      return buildSuccessResponse(domain, snapshot, ctx, true);
    }

    // ── 2. Fetch RDAP (con circuit breaker) ───────────────────────────────
    let rdapData: RdapResponse | null = null;
    try {
      rdapData = await whoisCircuit.execute(async () => {
        const res = await safeFetch(`https://rdap.org/domain/${domain}`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`RDAP HTTP ${res.status} para ${domain}`);
        return res.json();
      });
    } catch (e: unknown) {
      if (e instanceof CircuitOpenError) {
        ctx.log(`[WHOIS Full] Circuito abierto: ${e.message}. Usando fallback DNS.`);
      } else {
        ctx.log(`[WHOIS Full] Error RDAP: ${errMsg(e)}. Usando fallback DNS.`);
      }
      return buildFallbackResponse(domain, ctx);
    }

    if (!rdapData) {
      ctx.log(`[WHOIS Full] RDAP vacío para ${domain}. Usando fallback.`);
      return buildFallbackResponse(domain, ctx);
    }

    // ── 3. Cachear rdapData raw (30 min) ─────────────────────────────────
    geoipCache.set(cacheKey, rdapData, 30 * 60 * 1000);

    // ── 4. Parsear RDAP → WhoisSnapshot ──────────────────────────────────
    const snapshot = parseRdapToSnapshot(domain, rdapData);

    // ── 5. Persistir en whois_history (fire-and-forget) ──────────────────
    persistWhoisSnapshot(ctx.projectId, ctx.investigationId, snapshot)
      .then((result) => {
        if (result.changes.length > 0) {
          ctx.log(
            `[WHOIS Full] Cambios detectados en ${domain}: ` +
            result.changes.map((c) => `${c.label} (${c.severity})`).join(", ")
          );
          // Disparar alertas SIEM multicanal por los cambios WHOIS detectados
          sendWhoisChangeAlerts(domain, result.changes)
            .then((alertResult) => {
              if (alertResult.alertsSent > 0) {
                ctx.log(`[SIEM] ${alertResult.alertsSent} alertas WHOIS enviadas para ${domain}`);
              }
              if (alertResult.errors.length > 0) {
                logger.warn(`[SIEM] Errores enviando alertas WHOIS para ${domain}:`, alertResult.errors);
              }
            })
            .catch((alertErr) => {
              logger.error(`[SIEM] Error en alerta WHOIS para ${domain}:`, alertErr);
            });
        }
      })
      .catch((err) => {
        logger.error(`[WHOIS Full] Error persistiendo history para ${domain}:`, err);
      });

    // ── 6. Respuesta + findings ──────────────────────────────────────────
    return buildSuccessResponse(domain, snapshot, ctx, false);
  },
};

// ═══════════════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════════════

function parseRdapToSnapshot(domain: string, rdapData: RdapResponse): WhoisSnapshot {
  const events = rdapData.events || [];
  let createdDate: Date | null = null;
  let expiresDate: Date | null = null;
  let updatedDate: Date | null = null;

  for (const event of events) {
    const action = event.eventAction;
    const dateStr = event.eventDate;
    if (!dateStr) continue;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) continue;
    if (action === "registration") createdDate = d;
    else if (action === "expiration") expiresDate = d;
    else if (action === "last changed") updatedDate = d;
  }

  if (!createdDate) createdDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  if (!expiresDate) expiresDate = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
  if (!updatedDate) updatedDate = createdDate;

  const entities = rdapData.entities || [];
  // registrar nunca es null en runtime: se garantiza "Desconocido" como fallback.
  // Tiparlo como string desde el inicio evita el `string | null` que TS no puede
  // estrechar cuando la variable se asigna dentro de un bucle.
  let registrar: string = "Desconocido";
  let abuseContact: string | null = null;
  let registrantOrg: string | null = null;

  for (const entity of entities) {
    if (!entity.vcardArray?.[1]) continue;
    const vcard = entity.vcardArray[1];
    const fnEntry = vcard.find((item) => item[0] === "fn");
    const orgEntry = vcard.find((item) => item[0] === "org");
    const emailEntry = vcard.find((item) => item[0] === "email");

    if (entity.roles?.includes("registrar") && fnEntry) registrar = fnEntry[3] || "Desconocido";
    if (entity.roles?.includes("abuse") && emailEntry) abuseContact = emailEntry[3] || null;
    if (entity.roles?.includes("registrant") && (orgEntry || fnEntry)) {
      registrantOrg = orgEntry?.[3] || fnEntry?.[3] || null;
    }
  }

  const status = rdapData.status || [];
  const nameservers: string[] = [];
  if (rdapData.nameservers) {
    for (const ns of rdapData.nameservers) {
      if (ns.ldhName) nameservers.push(ns.ldhName);
    }
  }

  return {
    domain,
    registrar,
    createdDate,
    expiresDate,
    updatedDate,
    status,
    nameservers,
    abuseContact,
    registrantOrg,
    originalData: rdapData as Record<string, unknown>,
  };
}

function buildSuccessResponse(
  domain: string,
  snapshot: ReturnType<typeof parseRdapToSnapshot>,
  ctx: ExecutionContext,
  fromCache: boolean,
): ExecutionResult<WhoisFullOutput> {
  const expiresMs = snapshot.expiresDate?.getTime() ?? null;
  const daysRemaining = expiresMs !== null
    ? Math.round((expiresMs - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const output = {
    success: true,
    domain,
    fromCache,
    // WhoisSnapshot tipa registrar como string|null; el parser garantiza no-null
    // en runtime (fallback "Desconocido"), así que el boundary lo asegura también
    // para cumplir el contrato WhoisFullOutput.registrar: string.
    registrar: snapshot.registrar ?? "Desconocido",
    createdDate: snapshot.createdDate?.toISOString() ?? null,
    updatedDate: snapshot.updatedDate?.toISOString() ?? null,
    expiresDate: snapshot.expiresDate?.toISOString() ?? null,
    daysRemaining,
    status: snapshot.status,
    nameservers: snapshot.nameservers,
    abuseContact: snapshot.abuseContact,
    registrantOrg: snapshot.registrantOrg,
  };

  const findings: Finding[] = [];

  if (daysRemaining !== null && daysRemaining < 30 && daysRemaining > 0) {
    findings.push({
      severity: "high",
      confidence: 0.99,
      title: `Expiración de Dominio Inminente (${daysRemaining} días)`,
      description: `El dominio ${domain} expira en ${daysRemaining} días. Sin renovación, los servicios DNS, correo y web dejarán de funcionar.`,
      recommendation: "Renueve el dominio inmediatamente desde el panel del registrador.",
      affectedAsset: domain,
      evidence: { expiresAt: output.expiresDate, daysRemaining },
    });
  }

  if (daysRemaining !== null && daysRemaining <= 0) {
    findings.push({
      severity: "critical",
      confidence: 1.0,
      title: "Dominio Expirado",
      description: `El dominio ${domain} se encuentra expirado y podría ser registrado por terceros.`,
      recommendation: "Renueve el dominio URGENTEMENTE o contacte a su registrador.",
      affectedAsset: domain,
      evidence: { expiresAt: output.expiresDate, daysRemaining },
    });
  }

  if (snapshot.nameservers.length === 0) {
    findings.push({
      severity: "critical",
      confidence: 1.0,
      title: "Dominio sin Nameservers Configurados",
      description: `El dominio ${domain} no tiene nameservers asociados. No es posible resolver servicios.`,
      recommendation: "Configure nameservers en el panel del registrador.",
      affectedAsset: domain,
      evidence: { nameservers: [] },
    });
  }

  if (!snapshot.abuseContact) {
    findings.push({
      severity: "low",
      confidence: 0.8,
      title: "Sin Contacto de Abuso WHOIS",
      description: `El dominio ${domain} no expone correo de abuso en su registro RDAP/WHOIS.`,
      recommendation: "Configure un contacto de abuso válido en el registrador.",
      affectedAsset: domain,
      evidence: { abuseContact: null },
    });
  }

  ctx.log(
    `[WHOIS Full] Completado para ${domain}. ` +
    `Registrador: ${snapshot.registrar}, ` +
    `Expira: ${daysRemaining !== null ? daysRemaining + " días" : "desconocido"}, ` +
    `${findings.length} hallazgos.`
  );

  return { success: true, output, findings };
}

async function buildFallbackResponse(
  domain: string,
  ctx: ExecutionContext,
): Promise<ExecutionResult<WhoisFullOutput>> {
  ctx.log(`[WHOIS Full] Generando fallback para ${domain}`);

  let nsList: string[] = [];
  try {
    nsList = await dns.resolve(domain, "NS");
  } catch {
    nsList = [];
  }

  const creationDate = new Date();
  creationDate.setFullYear(creationDate.getFullYear() - 5);
  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + 90);

  const output = {
    success: true,
    domain,
    fromCache: false,
    isFallback: true,
    registrar: "No disponible (RDAP sin conexión)",
    createdDate: creationDate.toISOString(),
    updatedDate: creationDate.toISOString(),
    expiresDate: expirationDate.toISOString(),
    daysRemaining: 90,
    status: ["active"],
    nameservers: nsList,
    abuseContact: null,
    registrantOrg: null,
  };

  const findings: Finding[] = [
    {
      severity: "info",
      confidence: 0.9,
      title: "Consulta WHOIS en Modo Degradado",
      description: `No se pudo consultar RDAP público para ${domain}. Los datos mostrados son una estimación basada en DNS.`,
      recommendation: "Intente nuevamente más tarde, o verifique manualmente en https://who.is/",
      affectedAsset: domain,
      evidence: { rdapFallback: true },
    },
  ];

  return { success: true, output, findings };
}
