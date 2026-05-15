import { task, wait } from "@trigger.dev/sdk";
import { db } from "@/shared/db";
import { audits, projects, crawlResults, issues } from "@/shared/db/schemas";
import { eq } from "drizzle-orm";
import { promises as dnsPromises } from "dns";

interface AnalyzeResult {
  statusCode: number;
  contentType: string | null;
  title: string | null;
  metaDescription: string | null;
  h1Tags: string[];
  h2Tags: string[];
  wordCount: number;
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

  // 2. Fetch with a 10s AbortSignal timeout to prevent unbounded hangs
  const response = await fetch(targetUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 (compatible; StrategicAuditBot/1.0; +https://strategicaudit.pro)",
    },
    signal: AbortSignal.timeout(20000), // Increased to 20-second timeout for better resilience
    next: { revalidate: 0 } as any,
  } as RequestInit);

  const contentType = response.headers.get("content-type") || "";
  const contentLength = response.headers.get("content-length");
  const statusCode = response.status;

  if (!response.ok) {
    throw new Error(`Error al descargar la URL de destino. Código de estado HTTP: ${statusCode}`);
  }

  // 3. Prevent Memory Exhaustion (OOM) by checking headers prior to reading text
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    throw new Error(`Tipo de archivo no soportado: "${contentType}". Solo se admiten páginas HTML.`);
  }

  if (contentLength && parseInt(contentLength, 10) > 5 * 1024 * 1024) {
    throw new Error(`El archivo HTML excede el límite máximo de tamaño de 5 MB (Tamaño detectado: ${(parseInt(contentLength, 10)/1024/1024).toFixed(2)} MB).`);
  }

  const html = await response.text();

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
    console.log(`[Audit] Iniciando auditoría real para el proyecto: ${payload.projectId}, ID Auditoría: ${payload.auditId}`);

    const projectResult = await db.select().from(projects).where(eq(projects.id, payload.projectId)).limit(1);
    const project = projectResult[0];

    if (!project) {
      throw new Error(`Proyecto ${payload.projectId} no encontrado`);
    }

    // 1. Obtener y actualizar el registro de auditoría pre-creado a estado 'running'
    const [audit] = await db.update(audits)
      .set({
        status: "running",
        startedAt: new Date()
      })
      .where(eq(audits.id, payload.auditId))
      .returning();

    if (!audit) {
      throw new Error(`Registro de auditoría ${payload.auditId} no encontrado en base de datos`);
    }

    console.log(`[Audit] Registro de auditoría ${audit.id} actualizado a estado de ejecución.`);

    let targetUrl = project.domain;
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = `https://${targetUrl}`;
    }

    try {
      // 2. Ejecutar análisis web
      console.log(`[Audit] Analizando sitio web: ${targetUrl}`);
      const analysis = await analyzeUrl(targetUrl);
      console.log(`[Audit] Análisis completado. Estado HTTP: ${analysis.statusCode}, Palabras: ${analysis.wordCount}`);

      // 3. Guardar resultados de la descarga
      await db.insert(crawlResults).values({
        auditId: audit.id,
        url: targetUrl,
        statusCode: analysis.statusCode,
        contentType: analysis.contentType,
        title: analysis.title,
        metaDescription: analysis.metaDescription,
        h1Tags: analysis.h1Tags,
        h2Tags: analysis.h2Tags,
        wordCount: analysis.wordCount,
      });

      // 4. Evaluar reglas de optimización SEO y técnicas en español
      const detectedIssues = [];

      // -- Reglas de Título
      if (!analysis.title) {
        detectedIssues.push({
          projectId: project.id,
          auditId: audit.id,
          url: targetUrl,
          severity: "critical" as const,
          category: "meta" as const,
          title: "Falta etiqueta de Título (Title Tag)",
          description: "La página no tiene una etiqueta `<title>` en su sección `<head>`, lo que impide que los motores de búsqueda muestren un encabezado clickeable en los resultados de búsqueda.",
          recommendation: "Crea una etiqueta `<title>` que describa de manera concisa el tema de la página (entre 50 y 60 caracteres) y colócala dentro de la sección `<head>`.",
        });
      } else if (analysis.title.length > 60) {
        detectedIssues.push({
          projectId: project.id,
          auditId: audit.id,
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
        detectedIssues.push({
          projectId: project.id,
          auditId: audit.id,
          url: targetUrl,
          severity: "critical" as const,
          category: "meta" as const,
          title: "Falta etiqueta de Meta Descripción",
          description: "No se detectó una meta descripción en la página. Los buscadores generarán un fragmento automático que puede no ser atractivo para tus potenciales clientes.",
          recommendation: "Agrega una etiqueta `<meta name=\"description\" content=\"...\">` de entre 120 y 160 caracteres que sintetice el contenido con un llamado a la acción persuasivo.",
        });
      } else if (analysis.metaDescription.length > 160) {
        detectedIssues.push({
          projectId: project.id,
          auditId: audit.id,
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
        detectedIssues.push({
          projectId: project.id,
          auditId: audit.id,
          url: targetUrl,
          severity: "critical" as const,
          category: "seo" as const,
          title: "Falta el encabezado principal de nivel 1 (H1)",
          description: "La página no cuenta con una etiqueta `<h1>`. El encabezado H1 define el tema de la página para los usuarios y los robots de indexación, siendo clave para el posicionamiento.",
          recommendation: "Introduce una única etiqueta `<h1>` con un título atractivo y descriptivo del negocio justo al inicio de la sección de contenido de la página.",
        });
      } else if (analysis.h1Tags.length > 1) {
        detectedIssues.push({
          projectId: project.id,
          auditId: audit.id,
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
        detectedIssues.push({
          projectId: project.id,
          auditId: audit.id,
          url: targetUrl,
          severity: "warning" as const,
          category: "seo" as const,
          title: "Contenido muy escaso detectado (Thin Content)",
          description: `La página cuenta con aproximadamente ${analysis.wordCount} palabras. Los sitios web con menos de 250 palabras de contenido de valor son considerados superficiales por Google, dificultando su posicionamiento.`,
          recommendation: "Enriquece la página con contenido escrito único de alta calidad, secciones informativas detalladas y artículos explicativos relevantes para tus clientes.",
        });
      }

      // 5. Insertar problemas encontrados
      if (detectedIssues.length > 0) {
        console.log(`[Audit] Guardando ${detectedIssues.length} problemas de optimización detectados en español.`);
        await db.insert(issues).values(detectedIssues);
      }

      // 6. Marcar auditoría como completada con éxito
      await db.update(audits)
        .set({ 
          status: "completed", 
          completedAt: new Date() 
        })
        .where(eq(audits.id, audit.id));

      console.log(`[Audit] Auditoría ${audit.id} finalizada exitosamente con ${detectedIssues.length} incidencias.`);
      return { auditId: audit.id, status: "completed", issuesFound: detectedIssues.length };

    } catch (err: any) {
      console.error(`[Audit] Fallo crítico durante el proceso de crawling para ${targetUrl}:`, err);

      await db.update(audits)
        .set({
          status: "failed",
          errorMessage: err.message || "Error desconocido durante la ejecución del rastreador.",
          completedAt: new Date()
        })
        .where(eq(audits.id, audit.id));

      throw err;
    }
  },
});
