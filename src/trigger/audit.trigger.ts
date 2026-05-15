import { task, wait } from "@trigger.dev/sdk";
import { db } from "@/shared/db";
import { audits, projects, crawlResults, issues } from "@/shared/db/schemas";
import { eq } from "drizzle-orm";
import { promises as dnsPromises } from "dns";
import { RedisCircuitBreaker } from "@/shared/lib/circuit-breaker";

console.log("[Trigger Module] audit.trigger.ts cargado correctamente.");
console.log("[Trigger Module] DATABASE_URL presente:", !!process.env.DATABASE_URL);

interface AnalyzeResult {
  statusCode: number;
  contentType: string | null;
  title: string | null;
  metaDescription: string | null;
  h1Tags: string[];
  h2Tags: string[];
  wordCount: number;
  error?: string;
}

// Zero-dependency helper to check if an IP address belongs to local/private/reserved subnets
function isPrivateIp(ip: string): boolean {
  // IPv4 Loopback (127.0.0.0/8)
  if (/^127\./.test(ip)) return true;
  
  // IPv4 Private Networks (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
  if (/^10\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  
  // IPv4 Link-Local (169.254.0.0/16)
  if (/^169\.254\./.test(ip)) return true;

  // IPv4 Carrier-Grade NAT (100.64.0.0/10)
  if (/^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./.test(ip)) return true;

  // IPv4 Current Network / Broadcast (0.0.0.0/8, 255.255.255.255)
  if (/^0\./.test(ip) || ip === "255.255.255.255") return true;

  // IPv6 Loopback (::1)
  if (ip === "::1" || ip === "0:0:0:0:0:0:0:1") return true;

  // IPv6 Link-Local (fe80::/10)
  if (/^fe[89ab][0-9a-f]:/i.test(ip)) return true;

  // IPv6 Unique Local (fc00::/7)
  if (/^f[cd][0-9a-f]{2}:/i.test(ip)) return true;

  return false;
}

// SSRF and DNS Rebinding Validator to protect background crawling tasks
async function validateSafeUrl(targetUrl: string): Promise<string> {
  const parsedUrl = new URL(targetUrl);
  
  // 1. Enforce strict http/https protocol
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error(`Protocolo no soportado: ${parsedUrl.protocol}. Solo se admiten HTTP y HTTPS.`);
  }

  const hostname = parsedUrl.hostname;

  // 2. Direct validation if hostname is raw IP
  const ipv4Regex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
  if (ipv4Regex.test(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error(`Acceso denegado: IP privada detectada (${hostname})`);
    }
    return targetUrl;
  }

  // 3. DNS Lookup resolution checking all records to prevent host redirection exploits
  try {
    const addresses = await dnsPromises.lookup(hostname, { all: true });
    for (const address of addresses) {
      if (isPrivateIp(address.address)) {
        throw new Error(`Acceso denegado: El host ${hostname} se resuelve a una IP privada (${address.address})`);
      }
    }
  } catch (dnsErr: any) {
    // If lookup throws an explicit access-denied error, propagate it
    if (dnsErr.message && dnsErr.message.includes("Acceso denegado")) {
      throw dnsErr;
    }
    // For other connection errors, let the fetch attempt resolve or fail naturally
    console.warn(`[Crawler Security] No se pudo resolver DNS para el host ${hostname}:`, dnsErr.message);
  }

  return targetUrl;
}

// Scraper nativo optimizado para una extracción rápida y ligera
async function analyzeUrl(targetUrl: string): Promise<AnalyzeResult> {
  // 1. Validate the URL to prevent SSRF
  await validateSafeUrl(targetUrl);

  // 2. Fetch with a 20s AbortSignal timeout to prevent unbounded hangs
  const crawlerCircuitBreaker = new RedisCircuitBreaker('web_crawler', {
    failureThreshold: 5,
    recoveryTimeout: 60000,
  });

  const response = await crawlerCircuitBreaker.execute(async () => {
    console.log(`[Crawler] Solicitando URL: ${targetUrl}`);
    return await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 StrategicAuditBot/1.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      },
      signal: AbortSignal.timeout(25000),
    });
  });

  if (!response.ok) {
    console.warn(`[Crawler] El sitio respondió con error HTTP ${response.status} para ${targetUrl}`);
    return { 
      statusCode: response.status, 
      contentType: response.headers.get("content-type") || "unknown",
      title: null,
      metaDescription: null,
      h1Tags: [],
      h2Tags: [],
      wordCount: 0
    };
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    console.warn(`[Crawler] El contenido no es HTML (${contentType}) para ${targetUrl}`);
    return { 
      statusCode: response.status, 
      contentType,
      title: null,
      metaDescription: null,
      h1Tags: [],
      h2Tags: [],
      wordCount: 0
    };
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > 8 * 1024 * 1024) {
    console.warn(`[Crawler] Archivo demasiado grande (${contentLength} bytes)`);
    return { statusCode: response.status, contentType, title: null, metaDescription: null, h1Tags: [], h2Tags: [], wordCount: 0, error: "Archivo demasiado grande" };
  }

  const statusCode = response.status;
  
  console.log(`[Crawler] Descargando contenido para ${targetUrl}...`);
  const html = await response.text();
  console.log(`[Crawler] Descarga completada (${html.length} caracteres)`);

  // 1. Extracción de etiqueta Title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : null;

  // 2. Extracción de Meta Descripción
  let metaDescription: string | null = null;
  const descMatch1 = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i);
  const descMatch2 = html.match(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*name=["']description["']/i);
  if (descMatch1) {
    metaDescription = descMatch1[1].trim();
  } else if (descMatch2) {
    metaDescription = descMatch2[1].trim();
  }

  // 3. Extracción de etiquetas H1
  const h1Regex = /<h1[^>]*>([\s\S]*?)<\/h1>/gi;
  const h1Tags: string[] = [];
  let m1;
  while ((m1 = h1Regex.exec(html)) !== null) {
    const cleaned = m1[1].replace(/<[^>]*>/g, "").trim();
    if (cleaned) h1Tags.push(cleaned);
  }

  // 4. Extracción de etiquetas H2 (Límite de 30 para consistencia)
  const h2Regex = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  const h2Tags: string[] = [];
  let m2;
  let h2Count = 0;
  while ((m2 = h2Regex.exec(html)) !== null && h2Count < 30) {
    const cleaned = m2[1].replace(/<[^>]*>/g, "").trim();
    if (cleaned) h2Tags.push(cleaned);
    h2Count++;
  }

  // 5. Conteo aproximado de palabras
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyText = bodyMatch
    ? bodyMatch[1]
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]*>/g, " ")
    : "";
  const wordCount = bodyText.split(/\s+/).filter((w) => w.length > 0).length;

  return {
    statusCode,
    contentType,
    title,
    metaDescription,
    h1Tags,
    h2Tags,
    wordCount,
  };
}

export const runProjectAudit = task({
  id: "run-project-audit",
  retry: {
    maxAttempts: 3,
  },
  run: async (payload: { projectId: string; auditId: string; userId?: string }) => {
    console.log(`[Worker] Tarea recibida para auditoría ${payload.auditId} (Proyecto: ${payload.projectId})`);
    
    try {
      // 1. Actualización inmediata para mover la UI del 15%
      console.log(`[Worker] Marcando auditoría como 'running'...`);
      const [audit] = await db.update(audits)
        .set({
          status: "running",
          startedAt: new Date()
        })
        .where(eq(audits.id, payload.auditId))
        .returning();

      if (!audit) {
        // Pequeña espera por si hay lag de base de datos
        await new Promise(r => setTimeout(r, 1000));
        const [auditRetry] = await db.update(audits)
          .set({ status: "running" })
          .where(eq(audits.id, payload.auditId))
          .returning();
          
        if (!auditRetry) throw new Error(`Registro de auditoría ${payload.auditId} no encontrado.`);
      }

      // 2. Datos del proyecto
      const projectResult = await db.select().from(projects).where(eq(projects.id, payload.projectId)).limit(1);
      const project = projectResult[0];

      if (!project) throw new Error(`Proyecto ${payload.projectId} no encontrado`);

      let targetUrl = project.domain;
      if (!/^https?:\/\//i.test(targetUrl)) targetUrl = `https://${targetUrl}`;

      // 3. Ejecutar análisis web
      console.log(`[Worker] Analizando URL: ${targetUrl}`);
      const analysis = await analyzeUrl(targetUrl);
      console.log(`[Worker] Análisis completado. Status: ${analysis.statusCode}, Words: ${analysis.wordCount}`);

      // 4. Guardar resultados
      await db.insert(crawlResults).values({
        auditId: payload.auditId,
        url: targetUrl,
        statusCode: analysis.statusCode,
        contentType: analysis.contentType,
        title: analysis.title,
        metaDescription: analysis.metaDescription,
        h1Tags: analysis.h1Tags,
        h2Tags: analysis.h2Tags,
        wordCount: analysis.wordCount,
      });

      const issuesToInsert = [];
      
      if (!analysis.title) {
        issuesToInsert.push({
          projectId: payload.projectId,
          auditId: payload.auditId,
          url: targetUrl,
          severity: "critical" as const,
          category: "meta" as const,
          title: "Falta etiqueta de Título (Title Tag)",
          description: "La página no tiene una etiqueta `<title>` en su sección `<head>`, lo que impide que los motores de búsqueda muestren un encabezado clickeable en los resultados de búsqueda.",
          recommendation: "Crea una etiqueta `<title>` que describa de manera concisa el tema de la página (entre 50 y 60 caracteres) y colócala dentro de la sección `<head>`.",
        });
      } else if (analysis.title.length > 60) {
        issuesToInsert.push({
          projectId: payload.projectId,
          auditId: payload.auditId,
          url: targetUrl,
          severity: "warning" as const,
          category: "meta" as const,
          title: "El título de la página supera el tamaño recomendado",
          description: `El título contiene ${analysis.title.length} caracteres. Los buscadores como Google recortan los títulos que exceden los 60 caracteres en la página de resultados.`,
          recommendation: `Reduce el título "${analysis.title}" a menos de 60 caracteres, manteniendo las palabras clave de negocio al inicio.`,
        });
      }

      // -- Reglas de Meta Descripción
      if (!analysis.metaDescription) {
        issuesToInsert.push({
          projectId: payload.projectId,
          auditId: payload.auditId,
          url: targetUrl,
          severity: "critical" as const,
          category: "meta" as const,
          title: "Falta etiqueta de Meta Descripción",
          description: "No se detectó una meta descripción en la página. Los buscadores generarán un fragmento automático que puede no ser atractivo para tus potenciales clientes.",
          recommendation: "Agrega una etiqueta `<meta name=\"description\" content=\"...\">` de entre 120 y 160 caracteres que sintetice el contenido con un llamado a la acción persuasivo.",
        });
      } else if (analysis.metaDescription.length > 160) {
        issuesToInsert.push({
          projectId: payload.projectId,
          auditId: payload.auditId,
          url: targetUrl,
          severity: "warning" as const,
          category: "meta" as const,
          title: "La meta descripción supera el tamaño recomendado",
          description: `La meta descripción contiene ${analysis.metaDescription.length} caracteres. Exceder el límite recomendado de 160 caracteres provoca recortes visuales en Google.`,
          recommendation: `Ajusta el contenido de tu descripción para que se ubique entre los 120 y 160 caracteres, priorizando la propuesta de valor y las palabras clave clave de la marca.`,
        });
      }

      // -- Estructura de Encabezados (H1)
      if (analysis.h1Tags.length === 0) {
        issuesToInsert.push({
          projectId: payload.projectId,
          auditId: payload.auditId,
          url: targetUrl,
          severity: "critical" as const,
          category: "seo" as const,
          title: "Falta el encabezado principal de nivel 1 (H1)",
          description: "La página no cuenta con una etiqueta `<h1>`. El encabezado H1 define el tema de la página para los usuarios y los robots de indexación, siendo clave para el posicionamiento.",
          recommendation: "Introduce una única etiqueta `<h1>` con un título atractivo y descriptivo del negocio justo al inicio de la sección de contenido de la página.",
        });
      } else if (analysis.h1Tags.length > 1) {
        issuesToInsert.push({
          projectId: payload.projectId,
          auditId: payload.auditId,
          url: targetUrl,
          severity: "warning" as const,
          category: "seo" as const,
          title: "Múltiples encabezados de nivel 1 (H1) detectados",
          description: `Se encontraron ${analysis.h1Tags.length} etiquetas H1 en el código. El uso redundante de H1 debilita la autoridad temática de la página y confunde a los motores de búsqueda.`,
          recommendation: "Consolida los títulos para tener un único encabezado `<h1>`. Cambia los encabezados secundarios repetidos a etiquetas `<h2>` o `<h3>` para mantener la jerarquía semántica.",
        });
      }

      // -- Espesor de Contenido
      if (analysis.wordCount > 0 && analysis.wordCount < 250) {
        issuesToInsert.push({
          projectId: payload.projectId,
          auditId: payload.auditId,
          url: targetUrl,
          severity: "warning" as const,
          category: "seo" as const,
          title: "Contenido muy escaso detectado (Thin Content)",
          description: `La página cuenta con aproximadamente ${analysis.wordCount} palabras. Los sitios web con menos de 250 palabras de contenido de valor son considerados superficiales por Google, dificultando su posicionamiento.`,
          recommendation: "Enriquece la página con contenido escrito único de alta calidad, secciones informativas detalladas y artículos explicativos relevantes para tus clientes.",
        });
      }

      if (issuesToInsert.length > 0) {
        console.log(`[Worker] Guardando ${issuesToInsert.length} problemas de optimización detectados.`);
        // @ts-ignore
        await db.insert(issues).values(issuesToInsert);
      }

      // 6. Finalizar
      await db.update(audits)
        .set({
          status: "completed",
          completedAt: new Date()
        })
        .where(eq(audits.id, payload.auditId));

      console.log(`[Worker] Auditoría ${payload.auditId} finalizada con éxito.`);

    } catch (err: any) {
      console.error(`[Worker] Error fatal en auditoría ${payload.auditId}:`, err);
      
      try {
        await db.update(audits)
          .set({
            status: "failed",
            errorMessage: err.message || "Error desconocido durante la ejecución.",
            completedAt: new Date()
          })
          .where(eq(audits.id, payload.auditId));
      } catch (updateErr) {
        console.error("[Worker] Error al intentar marcar como fallido en DB:", updateErr);
      }
      
      throw err;
    }
  },
});
