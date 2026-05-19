import { z } from "zod";
import dns from "node:dns/promises";
import { assertPublicHostname } from "../security/egress-guard";
import { ToolExecutor, ExecutionContext, ExecutionResult, Finding } from "../types/executor.types";

const domainSchema = z.object({ domain: z.string().min(3).max(253) });
const dkimSchema = domainSchema.extend({ selector: z.string().default("default") });

async function safeResolveTxt(name: string): Promise<string[] | null> {
  try {
    const records = await dns.resolveTxt(name);
    return records.map(r => r.join(" "));
  } catch {
    return null;
  }
}

/**
 * Helper para contar de forma simple los lookups DNS generados por SPF.
 * Un SPF genera DNS lookups en mecanismos 'include', 'a', 'mx', 'ptr', 'exists', 'redirect'.
 */
function countSpfDnsLookups(spfRecord: string): { count: number; nestedIncludes: string[] } {
  const parts = spfRecord.split(/\s+/);
  let count = 0;
  const nestedIncludes: string[] = [];

  for (const part of parts) {
    const clean = part.toLowerCase();
    if (
      clean.startsWith("include:") ||
      clean.startsWith("a:") ||
      clean.startsWith("mx:") ||
      clean.startsWith("exists:") ||
      clean.startsWith("redirect=") ||
      clean === "a" ||
      clean === "mx"
    ) {
      count++;
      if (clean.startsWith("include:")) {
        nestedIncludes.push(part.substring(8));
      }
    }
  }

  return { count, nestedIncludes };
}

/**
 * 1. SPF Analyzer Executor
 */
export const emailSpfExecutor: ToolExecutor<{ domain: string }, any> = {
  id: "email.spf",
  timeoutMs: 12000,
  category: "email-security",
  validate(input: unknown) {
    return domainSchema.parse(input);
  },
  async execute(ctx: ExecutionContext, { domain }): Promise<ExecutionResult<any>> {
    ctx.log(`Iniciando análisis SPF seguro para: ${domain}`);
    await assertPublicHostname(domain);

    const txtRecords = await safeResolveTxt(domain) || [];
    const spfRecord = txtRecords.find(r => r.toLowerCase().startsWith("v=spf1"));

    const findings: Finding[] = [];

    if (!spfRecord) {
      findings.push({
        severity: "high",
        confidence: 0.99,
        title: "Registro SPF Inexistente",
        description: `El dominio ${domain} no dispone de un registro SPF configurado en su DNS. Esto permite a cualquier atacante falsificar correos legítimos simulando proceder de este dominio corporativo.`,
        recommendation: "Añada un registro TXT con un contenido similar a: 'v=spf1 include:_spf.google.com ~all' de acuerdo con sus proveedores autorizados.",
        affectedAsset: domain,
        evidence: { spfFound: false },
      });

      return {
        success: true,
        output: { domain, hasSpf: false, raw: null, lookups: 0 },
        findings,
      };
    }

    const { count: lookups, nestedIncludes } = countSpfDnsLookups(spfRecord);
    const hasPlusAll = spfRecord.includes("+all");
    const hasQuestionAll = spfRecord.includes("?all");
    const hasMinusAll = spfRecord.includes("-all");
    const hasSoftFail = spfRecord.includes("~all");

    let policy = "unknown";
    if (hasPlusAll) policy = "+all (Permisivo / Peligroso)";
    else if (hasQuestionAll) policy = "?all (Neutral / Inseguro)";
    else if (hasMinusAll) policy = "-all (Hard Fail / Seguro)";
    else if (hasSoftFail) policy = "~all (Soft Fail / Recomendado)";

    const output = {
      domain,
      hasSpf: true,
      raw: spfRecord,
      policy,
      lookups,
      nestedIncludes,
    };

    if (hasPlusAll) {
      findings.push({
        severity: "critical",
        confidence: 1.0,
        title: "Política SPF Crítica (+all)",
        description: `El registro SPF de ${domain} emplea el calificador '+all' al final. Esto significa literalmente que 'cualquier dirección IP en internet tiene permiso explícito' de enviar correos a nombre de su dominio corporativo, inutilizando las defensas contra phishing.`,
        recommendation: "Sustituya '+all' de inmediato por '~all' (SoftFail) o '-all' (HardFail) en su registro DNS TXT.",
        affectedAsset: domain,
        evidence: { raw: spfRecord },
      });
    } else if (hasQuestionAll) {
      findings.push({
        severity: "high",
        confidence: 0.95,
        title: "Política SPF Insegura (?all)",
        description: `El calificador '?all' configurado no aplica ningún control de validación definitivo (estado neutral). Los servidores de correo receptores no penalizarán correos sospechosos o suplantados.`,
        recommendation: "Modifique su política de terminación a '~all' para forzar a los destinatarios a evaluar el correo falsificado como spam.",
        affectedAsset: domain,
        evidence: { raw: spfRecord },
      });
    }

    if (lookups > 10) {
      findings.push({
        severity: "high",
        confidence: 1.0,
        title: "Exceso de Consultas SPF Recursivas (>10 DNS Lookups)",
        description: `El registro SPF genera un total de ${lookups} consultas DNS de resolución recursiva, superando el límite estricto de 10 impuesto por la RFC 7208. Esto causará un fallo sintáctico (PermError) en los validadores de correo de destino, ignorando por completo sus políticas SPF.`,
        recommendation: "Optimice el registro simplificando subredes mediante rangos CIDR (ip4/ip6) en lugar de encadenar múltiples includes redundantes.",
        affectedAsset: domain,
        evidence: { lookups, limit: 10 },
      });
    }

    ctx.log(`Análisis SPF completado. Política detectada: ${policy}, Consultas DNS: ${lookups}`);
    return { success: true, output, findings };
  },
};

/**
 * 2. DMARC Analyzer Executor
 */
export const emailDmarcExecutor: ToolExecutor<{ domain: string }, any> = {
  id: "email.dmarc",
  timeoutMs: 12000,
  category: "email-security",
  validate(input: unknown) {
    return domainSchema.parse(input);
  },
  async execute(ctx: ExecutionContext, { domain }): Promise<ExecutionResult<any>> {
    ctx.log(`Iniciando análisis DMARC seguro para: ${domain}`);
    await assertPublicHostname(domain);

    const dmarcDomain = `_dmarc.${domain}`;
    const txtRecords = await safeResolveTxt(dmarcDomain) || [];
    const dmarcRecord = txtRecords.find(r => r.toLowerCase().startsWith("v=dmarc1"));

    const findings: Finding[] = [];

    if (!dmarcRecord) {
      findings.push({
        severity: "critical",
        confidence: 0.99,
        title: "Ausencia Absoluta de Registro DMARC",
        description: `El dominio ${domain} carece de protección DMARC. Sin DMARC, no hay forma de monitorear o mitigar intentos de phishing, exponiendo la marca de la organización a campañas de abuso masivo.`,
        recommendation: "Añada un registro TXT en '_dmarc.[dominio]' con al menos una política básica: 'v=dmarc1; p=none; rua=mailto:dmarc@su-dominio.com'.",
        affectedAsset: domain,
        evidence: { dmarcFound: false },
      });

      return {
        success: true,
        output: { domain, hasDmarc: false, raw: null, policy: "none" },
        findings,
      };
    }

    // Parsea campos principales de DMARC
    const parts = dmarcRecord.split(";").map(p => p.trim());
    const tags: Record<string, string> = {};
    for (const p of parts) {
      const idx = p.indexOf("=");
      if (idx !== -1) {
        const key = p.substring(0, idx).trim().toLowerCase();
        const value = p.substring(idx + 1).trim();
        tags[key] = value;
      }
    }

    const policy = tags["p"] ? tags["p"].toLowerCase() : "none";
    const rua = tags["rua"] || null;
    const pct = tags["pct"] ? parseInt(tags["pct"]) : 100;

    const output = {
      domain,
      hasDmarc: true,
      raw: dmarcRecord,
      policy,
      rua,
      pct,
    };

    if (policy === "none") {
      findings.push({
        severity: "medium",
        confidence: 0.9,
        title: "Política DMARC configurada en Modo Monitoreo (p=none)",
        description: `El dominio tiene configurada una directiva DMARC p=none. Esto es excelente para auditoría inicial, pero significa que los correos que fallen las comprobaciones SPF/DKIM seguirán entregándose de forma normal a los buzones del usuario sin ser bloqueados.`,
        recommendation: "Tras validar sus flujos mediante reportes RUA, endurezca la política a 'p=quarantine' y eventualmente a 'p=reject'.",
        affectedAsset: domain,
        evidence: { policy },
      });
    }

    if (!rua) {
      findings.push({
        severity: "high",
        confidence: 0.95,
        title: "Falta de Destino de Reportes Agregados DMARC (rua)",
        description: `La configuración DMARC de ${domain} no indica ningún buzón receptor de telemetría (tag 'rua'). La organización está completamente a ciegas y no recibirá informes periódicos sobre IPs sospechosas abusando de su identidad corporativa.`,
        recommendation: "Defina el tag 'rua=mailto:dmarc-reports@su-dominio.com' dentro del registro DMARC.",
        affectedAsset: domain,
        evidence: { ruaMissing: true },
      });
    }

    ctx.log(`Análisis DMARC completado. Política final: p=${policy}`);
    return { success: true, output, findings };
  },
};

/**
 * 3. DKIM Analyzer Executor
 */
export const emailDkimExecutor: ToolExecutor<{ domain: string; selector: string }, any> = {
  id: "email.dkim",
  timeoutMs: 12000,
  category: "email-security",
  validate(input: unknown) {
    return dkimSchema.parse(input);
  },
  async execute(ctx: ExecutionContext, { domain, selector }): Promise<ExecutionResult<any>> {
    const sel = selector || "default";
    ctx.log(`Iniciando análisis DKIM seguro para: ${domain} con selector: ${sel}`);
    await assertPublicHostname(domain);

    const dkimDomain = `${sel}._domainkey.${domain}`;
    const txtRecords = await safeResolveTxt(dkimDomain) || [];
    const dkimRecord = txtRecords.find(r => r.toLowerCase().startsWith("v=dkim1") || r.toLowerCase().includes("k="));

    const findings: Finding[] = [];

    if (!dkimRecord) {
      return {
        success: true,
        output: { domain, selector: sel, hasDkim: false, raw: null },
        findings: [
          {
            severity: "info",
            confidence: 0.7,
            title: `Selector DKIM no resuelto (${sel})`,
            description: `No se localizó un registro de clave pública DKIM para el selector '${sel}' en ${domain}. Este selector puede no estar activo o su proveedor de correo podría utilizar un valor alternativo.`,
            recommendation: "Asegúrese de consultar el selector correcto configurado en su proveedor de correo corporativo.",
            affectedAsset: dkimDomain,
          },
        ],
      };
    }

    const output = {
      domain,
      selector: sel,
      hasDkim: true,
      raw: dkimRecord,
    };

    // Validar clave débil. Las llaves públicas DKIM se definen con p=Base64Key
    const pMatch = dkimRecord.match(/p=([^;]+)/i);
    if (pMatch && pMatch[1]) {
      const base64Key = pMatch[1].trim();
      // Estimación del largo de clave RSA por el largo de la cadena base64
      // Una clave RSA 1024 bits Base64 suele medir entre 200 y 250 caracteres.
      // Una clave RSA 2048 bits suele medir más de 390 caracteres.
      // Claves de 512 bits miden en torno a 100 caracteres.
      const keyLengthChars = base64Key.length;
      if (keyLengthChars < 180) {
        findings.push({
          severity: "high",
          confidence: 0.85,
          title: "Clave Criptográfica DKIM Débil (< 1024 bits)",
          description: `La clave criptográfica asociada al selector '${sel}' parece ser de longitud débil. Claves criptográficas inferiores a 1024 bits son vulnerables a factorización matemática rápida en computadoras convencionales de bajo costo, permitiendo falsificar firmas DKIM legítimas.`,
          recommendation: "Genere una nueva firma DKIM criptográfica con longitud de 2048 bits desde la administración de su consola de correo.",
          affectedAsset: dkimDomain,
          evidence: { rawCharsLength: keyLengthChars },
        });
      }
    }

    ctx.log(`Análisis DKIM finalizado para selector '${sel}'.`);
    return { success: true, output, findings };
  },
};
