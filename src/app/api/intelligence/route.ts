import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import dns from "dns";
import tls from "tls";
import { db } from "@/shared/db";
import { withRLS } from "@/shared/db/rls";
import {
  projects,
  intelligenceInvestigations,
  intelligenceToolRuns,
  intelligenceFindings,
  intelligenceAssets,
  intelligenceRunEvents
} from "@/shared/db/schemas";
import { eq, and, desc } from "drizzle-orm";
import { createClient } from "@/shared/lib/supabase/server";
import { checkAiRateLimit } from "@/shared/lib/ratelimit";
import { assertPublicHostname } from "@/shared/utils/egress-guard";

export const dynamic = "force-dynamic";

const inputSchema = z.object({
  target: z.string().min(1).max(2048),
  projectId: z.string().uuid()
});

// Helper to normalized hosts
function getNormalizedHost(target: string): string {
  let host = target.trim().toLowerCase();
  if (host.includes("://")) {
    try {
      host = new URL(host).hostname;
    } catch {
      // Keep it as is if parse error
    }
  } else if (host.includes("@")) {
    host = host.split("@")[1];
  }
  return host.split(":")[0];
}

// Node.js TLS handler
async function checkSslHandshake(hostname: string): Promise<any> {
  return new Promise((resolve) => {
    const socket = tls.connect({
      host: hostname,
      port: 443,
      servername: hostname,
      rejectUnauthorized: false,
      timeout: 5000,
    }, () => {
      const cert = socket.getPeerCertificate(true);
      socket.end();
      if (!cert || Object.keys(cert).length === 0) {
        resolve({ valid: false, error: "No peer certificate returned" });
        return;
      }
      
      const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
      const validFrom = cert.valid_from ? new Date(cert.valid_from) : null;
      const daysRemaining = validTo ? Math.round((validTo.getTime() - Date.now()) / (1000 * 3600 * 24)) : null;

      resolve({
        valid: socket.authorized,
        authorizationError: socket.authorizationError || null,
        subject: cert.subject,
        issuer: cert.issuer,
        validFrom,
        validTo,
        daysRemaining,
        serialNumber: cert.serialNumber,
        bits: cert.bits,
      });
    });

    socket.on("error", (err) => {
      resolve({ valid: false, error: err.message });
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve({ valid: false, error: "SSL handshake request timed out after 5000ms" });
    });
  });
}

// Fetch headers safely
async function checkHeaders(hostname: string): Promise<any> {
  try {
    const protocol = "https://";
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(`${protocol}${hostname}`, {
      method: "GET",
      headers: { "User-Agent": "StrategicAuditPro-Intelligence/1.0" },
      signal: controller.signal
    });
    clearTimeout(id);

    const headers = response.headers;
    return {
      success: true,
      statusCode: response.status,
      securityHeaders: {
        csp: headers.get("content-security-policy") || null,
        hsts: headers.get("strict-transport-security") || null,
        xfo: headers.get("x-frame-options") || null,
        xcto: headers.get("x-content-type-options") || null,
        xxp: headers.get("x-xss-protection") || null,
        server: headers.get("server") || null,
      }
    };
  } catch (err: any) {
    // Try http fallback if https failed
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 4000);
      const response = await fetch(`http://${hostname}`, {
        method: "GET",
        headers: { "User-Agent": "StrategicAuditPro-Intelligence/1.0" },
        signal: controller.signal
      });
      clearTimeout(id);
      
      const headers = response.headers;
      return {
        success: true,
        statusCode: response.status,
        securityHeaders: {
          csp: headers.get("content-security-policy") || null,
          hsts: headers.get("strict-transport-security") || null,
          xfo: headers.get("x-frame-options") || null,
          xcto: headers.get("x-content-type-options") || null,
          xxp: headers.get("x-xss-protection") || null,
          server: headers.get("server") || null,
        }
      };
    } catch (httpErr: any) {
      return { success: false, error: err.message || "Unreachable host" };
    }
  }
}

// DNS resolver wrap
async function resolveDns(hostname: string, recordType: "A" | "AAAA" | "MX" | "NS" | "TXT"): Promise<any> {
  try {
    return await dns.promises.resolve(hostname, recordType);
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const investigationId = searchParams.get("investigationId");

    const result = await withRLS(user.id, async (tx) => {
      if (investigationId) {
        const investigation = await tx.query.intelligenceInvestigations.findFirst({
          where: eq(intelligenceInvestigations.id, investigationId)
        });

        if (!investigation) {
          return { success: false, status: 404, error: "Investigación no encontrada" };
        }

        const findings = await tx.query.intelligenceFindings.findMany({
          where: eq(intelligenceFindings.investigationId, investigationId)
        });

        const events = await tx.query.intelligenceRunEvents.findMany({
          where: eq(intelligenceRunEvents.investigationId, investigationId),
          orderBy: [desc(intelligenceRunEvents.createdAt)]
        });

        const assets = await tx.query.intelligenceAssets.findMany({
          where: eq(intelligenceAssets.investigationId, investigationId)
        });

        return {
          success: true,
          status: 200,
          data: { investigation, findings, events, assets }
        };
      }

      if (!projectId) {
        return { success: false, status: 400, error: "Falta ID de proyecto" };
      }

      const list = await tx.query.intelligenceInvestigations.findMany({
        where: eq(intelligenceInvestigations.projectId, projectId),
        orderBy: [desc(intelligenceInvestigations.createdAt)]
      });

      return {
        success: true,
        status: 200,
        data: { investigations: list }
      };
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      ...result.data
    });

  } catch (error: any) {
    console.error("GET intelligence failure:", error);
    return NextResponse.json({
      success: false,
      error: `Error al obtener las investigaciones: ${error.message || error}`
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let createdInvestigationId: string | undefined = undefined;
  let loggedInUserId: string | undefined = undefined;

  try {
    // Authenticate user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    loggedInUserId = user.id;

    const body = await req.json();
    const parseResult = inputSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ success: false, error: "Argumentos inválidos" }, { status: 400 });
    }

    const { target, projectId } = parseResult.data;

    // Check project authorization inside RLS context
    const project = await withRLS(user.id, async (tx) => {
      return await tx.query.projects.findFirst({
        where: eq(projects.id, projectId)
      });
    });

    if (!project) {
      return NextResponse.json({ success: false, error: "Proyecto no encontrado o acceso denegado" }, { status: 404 });
    }

    // Rate Limiting
    const rateLimit = await checkAiRateLimit(user.id);
    if (!rateLimit.success) {
      return NextResponse.json({ success: false, error: "Límite de solicitudes de IA excedido" }, { status: 429 });
    }

    // Extract target metadata
    const normalizedTarget = getNormalizedHost(target);
    
    // Validate target type
    let targetType: "domain" | "hostname" | "url" | "ip" | "email" = "hostname";
    if (target.includes("@")) {
      targetType = "email";
    } else if (target.includes("://")) {
      targetType = "url";
    } else if (/^[0-9.]+$/.test(normalizedTarget) || normalizedTarget.includes(":")) {
      targetType = "ip";
    } else {
      targetType = "domain";
    }

    // SSRF Prevention validation
    try {
      await assertPublicHostname(normalizedTarget);
    } catch (ssrfError: any) {
      return NextResponse.json({
        success: false,
        error: `Acceso denegado por EgressGuard: ${ssrfError.message}`
      }, { status: 403 });
    }

    console.log(`Starting Network & Security Diagnostics for ${normalizedTarget}...`);

    // Insert principal investigation inside RLS context
    const investigation = await withRLS(user.id, async (tx) => {
      const [record] = await tx.insert(intelligenceInvestigations).values({
        projectId,
        ownerId: user.id,
        title: `Auditoría de Infraestructura para ${normalizedTarget}`,
        target,
        normalizedTarget,
        targetType,
        status: "running"
      }).returning();
      return record;
    });

    createdInvestigationId = investigation.id;
    const tStart = Date.now();

    // Accumulated logs and tool runs in memory (to write in a single batch transaction later)
    const inMemoryEvents: Array<{ eventType: string; message: string; payload: any }> = [];
    const inMemoryToolRuns: Array<{
      toolId: string;
      category: string;
      status: "completed" | "failed";
      input: any;
      output: any;
      error: any;
      durationMs: number;
      startedAt: Date;
      completedAt: Date;
    }> = [];

    const logEventInMemory = (type: string, message: string, payload: any = {}) => {
      inMemoryEvents.push({ eventType: type, message, payload });
    };

    const saveToolRunInMemory = (toolId: string, category: string, input: any, output: any, err: any = null) => {
      const duration = Date.now() - tStart;
      inMemoryToolRuns.push({
        toolId,
        category,
        status: err ? "failed" : "completed",
        input: { target: normalizedTarget, ...input },
        output: output || {},
        error: err || null,
        durationMs: duration,
        startedAt: new Date(tStart),
        completedAt: new Date()
      });
    };

    logEventInMemory("info", `Iniciando Auditoría Técnica Avanzada para el host: ${normalizedTarget}`);

    // Concurrent network scanning
    const [
      dnsA, dnsAAAA, dnsMX, dnsNS, dnsTXT,
      sslInfo, headersInfo, dmarcTxt
    ] = await Promise.all([
      resolveDns(normalizedTarget, "A"),
      resolveDns(normalizedTarget, "AAAA"),
      resolveDns(normalizedTarget, "MX"),
      resolveDns(normalizedTarget, "NS"),
      resolveDns(normalizedTarget, "TXT"),
      checkSslHandshake(normalizedTarget),
      checkHeaders(normalizedTarget),
      resolveDns(`_dmarc.${normalizedTarget}`, "TXT")
    ]);

    // Save individual runs in memory
    saveToolRunInMemory("dns_lookup", "network", { types: ["A", "AAAA", "MX", "NS", "TXT"] }, {
      A: dnsA,
      AAAA: dnsAAAA,
      MX: dnsMX,
      NS: dnsNS,
      TXT: dnsTXT
    });
    logEventInMemory("success", `Resolución de registros DNS completada con éxito.`, { recordsCount: dnsA.length + dnsAAAA.length + dnsMX.length + dnsNS.length + dnsTXT.length });

    saveToolRunInMemory("ssl_check", "security", { port: 443 }, sslInfo, sslInfo.error);
    if (sslInfo.error) {
      logEventInMemory("error", `Fallo en Handshake SSL/TLS: ${sslInfo.error}`);
    } else {
      logEventInMemory("success", `SSL/TLS handshake verificado. Certificado emitido por ${sslInfo.issuer?.O || "CA Desconocida"}.`);
    }

    saveToolRunInMemory("security_headers", "security", {}, headersInfo, headersInfo.error);
    if (headersInfo.error) {
      logEventInMemory("warning", `Error al auditar cabeceras de seguridad HTTP: ${headersInfo.error}`);
    } else {
      logEventInMemory("success", `Auditoría de cabeceras HTTP finalizada.`);
    }

    // Parse Email Protocols (SPF / DMARC)
    const spfRecord = dnsTXT.flat().find((rec: string) => rec.startsWith("v=spf1")) || null;
    const dmarcRecord = dmarcTxt.flat().find((rec: string) => rec.startsWith("v=DMARC1")) || null;
    const emailSecurityOutput = { spf: spfRecord, dmarc: dmarcRecord };
    saveToolRunInMemory("email_security", "security", {}, emailSecurityOutput);
    logEventInMemory("success", `Evaluación de protocolos SPF y DMARC completada.`);

    // --- FORMULATE FINDINGS ---
    const findingsList: any[] = [];

    // SSL Findings
    if (sslInfo.error) {
      findingsList.push({
        severity: "critical",
        title: "Fallo en Certificado SSL/TLS",
        description: `El servidor no provee un certificado SSL/TLS válido o la conexión HTTPS falló: ${sslInfo.error}`,
        recommendation: "Instala o renueva el certificado SSL/TLS del host para asegurar que el tráfico esté cifrado. Usa Let's Encrypt para firmas automáticas gratuitas.",
        evidence: { error: sslInfo.error }
      });
    } else {
      if (sslInfo.daysRemaining !== null && sslInfo.daysRemaining <= 14) {
        findingsList.push({
          severity: "critical",
          title: `El Certificado SSL/TLS vence pronto (${sslInfo.daysRemaining} días)`,
          description: `El certificado de seguridad expira el ${new Date(sslInfo.validTo).toLocaleDateString()}. Los usuarios experimentarán advertencias severas de seguridad de no renovarse a tiempo.`,
          recommendation: "Agenda de inmediato la renovación del certificado TLS.",
          evidence: { daysRemaining: sslInfo.daysRemaining, validTo: sslInfo.validTo }
        });
      } else if (sslInfo.daysRemaining !== null && sslInfo.daysRemaining <= 30) {
        findingsList.push({
          severity: "medium",
          title: `Advertencia de expiración de certificado SSL/TLS (${sslInfo.daysRemaining} días)`,
          description: `El certificado expira en un mes. Prepara la rotación de claves.`,
          recommendation: "Planifica la rotación del certificado en la próxima ventana de mantenimiento.",
          evidence: { daysRemaining: sslInfo.daysRemaining }
        });
      }

      if (sslInfo.bits < 2048) {
        findingsList.push({
          severity: "high",
          title: "Llave de Cifrado SSL/TLS Débil",
          description: `El certificado utiliza una firma de llave inferior a 2048 bits (bits: ${sslInfo.bits}). Es vulnerable a ataques de fuerza bruta de computación moderna.`,
          recommendation: "Genera un nuevo Certificate Signing Request (CSR) usando una llave RSA de al menos 2048 bits o ECDSA.",
          evidence: { bits: sslInfo.bits }
        });
      }
    }

    // Email Security Findings
    if (!spfRecord) {
      findingsList.push({
        severity: "high",
        title: "Falta Registro de Protección de Correo SPF",
        description: "No se detectó un registro SPF configurado en el DNS del dominio. Esto permite que atacantes externos falsifiquen correos electrónicos bajo tu nombre (spoofing).",
        recommendation: "Crea un registro DNS de tipo TXT en tu raíz que detalle los servidores SMTP autorizados para enviar correos, por ejemplo: 'v=spf1 include:_spf.google.com ~all'.",
        evidence: { recordsChecked: dnsTXT }
      });
    }
    if (!dmarcRecord) {
      findingsList.push({
        severity: "high",
        title: "Falta Registro de Alineación de Políticas DMARC",
        description: "No se detectó la directiva DMARC en tu DNS. Sin ella, no tienes control ni visibilidad sobre los intentos fraudulentos de falsificación que fallan SPF/DKIM.",
        recommendation: "Crea un registro DNS TXT en '_dmarc' apuntando a una política inicial que reporte fallos: 'v=DMARC1; p=none; rua=mailto:seguridad@tudominio.com'.",
        evidence: { dmarcTxt }
      });
    }

    // Header Findings
    if (headersInfo.success && headersInfo.securityHeaders) {
      const sh = headersInfo.securityHeaders;
      if (!sh.hsts) {
        findingsList.push({
          severity: "medium",
          title: "Falta Cabecera de HSTS (Strict-Transport-Security)",
          description: "La cabecera de HSTS no está activa. Esto permite a los navegadores degradar la conexión a HTTP inseguro, facilitando ataques de tipo Man-In-The-Middle (MITM).",
          recommendation: "Configura tu servidor web o CDN para que inyecte la cabecera 'Strict-Transport-Security: max-age=31536000; includeSubDomains; preload'.",
          evidence: { securityHeaders: sh }
        });
      }
      if (!sh.csp) {
        findingsList.push({
          severity: "low",
          title: "Falta Cabecera de Content-Security-Policy (CSP)",
          description: "No existe una política de seguridad de contenido configurada. Tu sitio es vulnerable a inyecciones de scripts de terceros (Cross-Site Scripting / XSS).",
          recommendation: "Define políticas de origen restrictivas para recursos de imágenes, scripts y hojas de estilo a través de la directiva 'Content-Security-Policy'.",
          evidence: { securityHeaders: sh }
        });
      }
      if (!sh.xfo) {
        findingsList.push({
          severity: "low",
          title: "Falta Cabecera X-Frame-Options",
          description: "No se restringe la incrustación de este sitio dentro de iframes externos, haciéndolo vulnerable a ataques de clickjacking.",
          recommendation: "Activa la cabecera 'X-Frame-Options: SAMEORIGIN'.",
          evidence: { securityHeaders: sh }
        });
      }
    }

    // Deduct score based on findings
    let score = 100;
    for (const f of findingsList) {
      if (f.severity === "critical") score -= 25;
      else if (f.severity === "high") score -= 15;
      else if (f.severity === "medium") score -= 8;
      else if (f.severity === "low") score -= 3;
    }
    score = Math.max(10, score);

    logEventInMemory("info", `Auditoría de Infraestructura finalizada correctamente. Score global calculado: ${score}/100.`);

    // Block 3: Write findings, tool runs, events, and assets in a single atomic RLS transaction
    await withRLS(user.id, async (tx) => {
      // 1. Insert tool runs and map their database UUIDs
      const insertedRuns = await tx.insert(intelligenceToolRuns).values(
        inMemoryToolRuns.map(tr => ({
          investigationId: investigation.id,
          projectId,
          ...tr
        }))
      ).returning();

      const toolRunIdsByToolId = new Map<string, string>();
      for (const tr of insertedRuns) {
        toolRunIdsByToolId.set(tr.toolId, tr.id);
      }

      // 2. Insert findings with correctly resolved toolRunIds
      const findingsToInsert = findingsList.map(f => {
        let toolId = "security_headers";
        if (f.evidence?.error || f.title.includes("SSL") || f.title.includes("Certificado")) {
          toolId = "ssl_check";
        } else if (f.title.includes("SPF") || f.title.includes("DMARC")) {
          toolId = "email_security";
        }
        const toolRunId = toolRunIdsByToolId.get(toolId) || null;

        return {
          investigationId: investigation.id,
          toolRunId,
          projectId,
          severity: f.severity,
          confidence: "0.950",
          title: f.title,
          description: f.description,
          recommendation: f.recommendation,
          evidence: f.evidence
        };
      });

      if (findingsToInsert.length > 0) {
        await tx.insert(intelligenceFindings).values(findingsToInsert);
      }

      // 3. Save Discovered Assets
      if (Array.isArray(dnsA) && dnsA.length > 0) {
        for (const ip of dnsA) {
          await tx.insert(intelligenceAssets).values({
            projectId,
            investigationId: investigation.id,
            assetType: "ip_v4",
            value: ip,
            ip: ip
          }).onConflictDoUpdate({
            target: [intelligenceAssets.projectId, intelligenceAssets.assetType, intelligenceAssets.value],
            set: { lastSeenAt: new Date() }
          });
        }
      }

      // 4. Save Accumulated Run Events
      if (inMemoryEvents.length > 0) {
        await tx.insert(intelligenceRunEvents).values(
          inMemoryEvents.map(e => ({
            investigationId: investigation.id,
            ...e
          }))
        );
      }

      // 5. Finalize Main Investigation record
      await tx.update(intelligenceInvestigations).set({
        status: "completed",
        score,
        summary: `Auditoría finalizada. Se detectaron ${findingsList.length} hallazgos en total. Puntuación de Postura: ${score}/100.`,
        completedAt: new Date(),
        updatedAt: new Date()
      }).where(eq(intelligenceInvestigations.id, investigation.id));
    });

    return NextResponse.json({
      success: true,
      investigation: {
        id: investigation.id,
        title: investigation.title,
        target,
        normalizedTarget,
        targetType,
        score,
        status: "completed",
        summary: `Puntuación de Seguridad de Infraestructura: ${score}/100.`
      },
      dns: {
        A: dnsA,
        AAAA: dnsAAAA,
        MX: dnsMX,
        NS: dnsNS,
        TXT: dnsTXT
      },
      ssl: sslInfo,
      email: emailSecurityOutput,
      headers: headersInfo,
      findings: findingsList
    });

  } catch (error: any) {
    console.error("Diagnostic engine execution failure:", error);
    
    // Graceful Failure Handling State-Machine update
    if (createdInvestigationId && loggedInUserId) {
      const invId = createdInvestigationId;
      const userId = loggedInUserId;
      try {
        await withRLS(userId, async (tx) => {
          await tx.update(intelligenceInvestigations).set({
            status: "failed",
            summary: `Auditoría fallida debido a un error interno: ${error.message || error}`,
            updatedAt: new Date(),
            completedAt: new Date()
          }).where(eq(intelligenceInvestigations.id, invId));

          await tx.insert(intelligenceRunEvents).values({
            investigationId: invId,
            eventType: "error",
            message: `Error crítico de ejecución: ${error.message || error}`,
            payload: { error: error.stack || error }
          });
        });
      } catch (dbErr) {
        console.error("Failed to update failed state in DB:", dbErr);
      }
    }

    return NextResponse.json({
      success: false,
      error: `Error interno de ejecución diagnóstica: ${error.message || error}`
    }, { status: 500 });
  }
}
