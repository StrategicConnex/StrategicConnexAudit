import { z } from "zod";
import { assertPublicHostname } from "../security/egress-guard";
import {
  ToolExecutor, ExecutionContext, ExecutionResult,
  NetworkBgpOutput, ThreatCustomIntelOutput,
} from "../types/executor.types";

const domainSchema = z.object({ domain: z.string().min(3).max(253) });
const hostSchema = z.object({ host: z.string().min(3).max(253) });

/**
 * P1: BGP Analysis Executor
 *
 * Task 10 (2026-10-11): antes devolvía SIEMPRE un resultado inventado
 * (un bloque de documentación como prefijo, un ASN de ejemplo y `rpkiStatus`
 * marcado como "invalid") y un hallazgo `high` derivado de esos datos. Un
 * hallazgo de severidad alta
 * basado en datos ficticios es el peor tipo de falso positivo: el operador no
 * puede distinguirlo de una detección real. No existe integración real con un
 * looking glass / validador RPKI, así que el resultado honesto es NO DISPONIBLE.
 */
export const networkBgpExecutor: ToolExecutor<{ host: string }, NetworkBgpOutput> = {
  id: "network.bgp",
  timeoutMs: 15000,
  category: "network",
  validate(input: unknown) {
    return hostSchema.parse(input);
  },
  async execute(ctx: ExecutionContext, { host }): Promise<ExecutionResult<NetworkBgpOutput>> {
    ctx.log(`Iniciando análisis de enrutamiento BGP para: ${host}`);
    await assertPublicHostname(host);

    // Sin fuente real (RIPE Stat / BGPView) no se emite NINGÚN dato: ni
    // prefijos, ni ASN, ni veredicto RPKI. Tampoco findings: un hallazgo
    // (`high` incluido) derivado de datos inventados es un falso positivo.
    return {
      success: false,
      output: {
        host,
        prefixes: [],
        originAsn: "",
        announcingPeers: [],
        roaValid: false,
        rpkiStatus: "unknown",
        isFallback: true,
      },
      findings: [],
      error:
        "BGP_DATA_UNAVAILABLE: no hay integración con un looking glass/RPKI validator. " +
        "No se emite análisis de enrutamiento (antes se devolvía un resultado simulado).",
    };
  },
};

/**
 * P2: Custom Threat Intel Feeds Executor
 *
 * Task 10 (2026-10-11): antes bastaba con que el nombre del dominio contuviera
 * ciertas palabras para emitir un hallazgo `critical` con feeds inventados
 * (nombres de campañas y feeds que no existen). No hay feeds propietarios
 * configurados, así que el resultado honesto es NO DISPONIBLE.
 */
export const threatCustomIntelExecutor: ToolExecutor<{ domain: string }, ThreatCustomIntelOutput> = {
  id: "threat.custom_intel",
  timeoutMs: 10000,
  category: "threat",
  validate(input: unknown) {
    return domainSchema.parse(input);
  },
  async execute(ctx: ExecutionContext, { domain }): Promise<ExecutionResult<ThreatCustomIntelOutput>> {
    ctx.log(`Cruzando el dominio ${domain} con Threat Intel Feeds privados`);
    await assertPublicHostname(domain);

    // Sin feeds propietarios configurados no hay veredicto posible: no se
    // "adivina" por el nombre del dominio ni se inventan nombres de feed.
    // Un veredicto `critical` ficticio es indistinguible de una detección real.
    return {
      success: false,
      output: { domain, iocMatched: false, matchedFeeds: [], isFallback: true },
      findings: [],
      error:
        "THREAT_INTEL_UNAVAILABLE: no hay feeds propietarios configurados para este tenant. " +
        "No se emite veredicto de amenaza (antes se devolvía un match simulado por nombre de dominio).",
    };
  },
};
