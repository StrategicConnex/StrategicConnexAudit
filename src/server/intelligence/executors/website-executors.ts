import { z } from "zod";
import tls from "node:tls";
import { assertPublicHostname, safeFetch } from "../security/egress-guard";
import { ToolExecutor, ExecutionContext, ExecutionResult, Finding } from "../types/executor.types";

const urlSchema = z.object({ url: z.string().url() });
const hostSchema = z.object({ host: z.string().min(3).max(253) });

/**
 * 1. HTTP Headers Executor
 */
export const websiteHeadersExecutor: ToolExecutor<{ url: string }, any> = {
  id: "website.headers",
  timeoutMs: 12000,
  category: "website",
  validate(input: unknown) {
    return urlSchema.parse(input);
  },
  async execute(ctx: ExecutionContext, { url }): Promise<ExecutionResult<any>> {
    ctx.log(`Iniciando descarga segura de cabeceras HTTP para: ${url}`);
    const parsed = new URL(url);
    await assertPublicHostname(parsed.hostname);

    const headers: Record<string, string> = {};
    let status = 0;
    let statusText = "OK";

    try {
      const res = await safeFetch(url, { method: "HEAD" });
      status = res.status;
      statusText = res.statusText;
      res.headers.forEach((val, key) => {
        headers[key] = val;
      });
    } catch (e: any) {
      ctx.log(`Error al descargar cabeceras: ${e.message}`);
      return {
        success: false,
        output: { url },
        findings: [],
        error: `Fallo al recuperar las cabeceras HTTP: ${e.message}`,
      };
    }

    const output = {
      url,
      status,
      statusText,
      headers,
    };

    const findings: Finding[] = [];

    const serverHeader = headers["server"];
    if (serverHeader) {
      findings.push({
        severity: "info",
        confidence: 0.95,
        title: "Huella Digital de Servidor Web Expuesta",
        description: `El servidor web reporta explícitamente su identidad o versión mediante la cabecera 'Server: ${serverHeader}'. Esto ayuda a atacantes pasivos a perfilar vulnerabilidades conocidas de versiones sin parchear.`,
        recommendation: "Configure su servidor web o CDN para enmascarar o suprimir la cabecera 'Server'.",
        affectedAsset: url,
        evidence: { serverHeader },
      });
    }

    return { success: true, output, findings };
  },
};

/**
 * 2. Security Headers Evaluator
 */
export const websiteSecurityHeadersExecutor: ToolExecutor<{ url: string }, any> = {
  id: "website.security_headers",
  timeoutMs: 12000,
  category: "website",
  validate(input: unknown) {
    return urlSchema.parse(input);
  },
  async execute(ctx: ExecutionContext, { url }): Promise<ExecutionResult<any>> {
    ctx.log(`Evaluando postura de cabeceras de seguridad para: ${url}`);
    const parsed = new URL(url);
    await assertPublicHostname(parsed.hostname);

    const headers: Record<string, string> = {};
    try {
      const res = await safeFetch(url, { method: "HEAD" });
      res.headers.forEach((val, key) => {
        headers[key.toLowerCase()] = val;
      });
    } catch {
      // Intentar GET si HEAD falla
      try {
        const res = await safeFetch(url, { method: "GET" });
        res.headers.forEach((val, key) => {
          headers[key.toLowerCase()] = val;
        });
      } catch (e: any) {
        return {
          success: false,
          output: { url },
          findings: [],
          error: `Error al conectar para analizar cabeceras de seguridad: ${e.message}`,
        };
      }
    }

    const findings: Finding[] = [];

    const hasHsts = !!headers["strict-transport-security"];
    const hasCsp = !!headers["content-security-policy"];
    const hasXfo = !!headers["x-frame-options"];

    const output = {
      url,
      hsts: headers["strict-transport-security"] || null,
      csp: headers["content-security-policy"] || null,
      xfo: headers["x-frame-options"] || null,
      xcto: headers["x-content-type-options"] || null,
      rp: headers["referrer-policy"] || null,
    };

    if (!hasHsts) {
      findings.push({
        severity: "high",
        confidence: 0.99,
        title: "Ausencia de Cabecera HSTS (Strict-Transport-Security)",
        description: "El sitio no fuerza conexiones cifradas HTTPS de forma estricta. Esto permite ataques de intermediario (MitM) como el secuestro de sesiones SSL mediante degradación HTTP (SSL Strip).",
        recommendation: "Active la directiva Strict-Transport-Security con una política con max-age de al menos 1 año e incluya subdominios.",
        affectedAsset: url,
        evidence: { missing: "HSTS" },
      });
    }

    if (!hasCsp) {
      findings.push({
        severity: "high",
        confidence: 0.95,
        title: "Falta de Directiva Content-Security-Policy (CSP)",
        description: "El sitio web no cuenta con una política de restricción de orígenes seguros (CSP). Esto expone a sus usuarios a ataques de inyección de scripts cruzados (XSS) y ejecución de código malicioso remoto.",
        recommendation: "Es prioritario definir una cabecera Content-Security-Policy robusta que controle estrictamente el origen de ejecución de scripts y recursos.",
        affectedAsset: url,
        evidence: { missing: "CSP" },
      });
    }

    if (!hasXfo) {
      findings.push({
        severity: "medium",
        confidence: 0.9,
        title: "Falta de Cabecera X-Frame-Options",
        description: "El sitio web no mitiga el anidamiento malicioso de frames. Atacantes externos podrían enmarcar su portal web en sitios fraudulentos para ejecutar ataques de Clickjacking y secuestro de clics de los usuarios.",
        recommendation: "Añada la cabecera 'X-Frame-Options: SAMEORIGIN' o 'DENY' para evitar frames no autorizados.",
        affectedAsset: url,
        evidence: { missing: "X-Frame-Options" },
      });
    }

    return { success: true, output, findings };
  },
};

/**
 * 3. TLS / SSL Certificate Inspector
 */
export const websiteTlsExecutor: ToolExecutor<{ host: string }, any> = {
  id: "tls.scan",
  timeoutMs: 15000,
  category: "ssl-tls",
  validate(input: unknown) {
    return hostSchema.parse(input);
  },
  async execute(ctx: ExecutionContext, { host }): Promise<ExecutionResult<any>> {
    ctx.log(`Realizando Handshake TLS seguro para: ${host}`);
    await assertPublicHostname(host);

    return new Promise((resolve) => {
      const socket = tls.connect(443, host, { servername: host, rejectUnauthorized: false }, () => {
        const cert: any = socket.getPeerCertificate(true);
        const protocol = socket.getProtocol();
        const cipher = socket.getCipher();

        socket.destroy();

        if (!cert || Object.keys(cert).length === 0) {
          resolve({
            success: false,
            output: { host },
            findings: [],
            error: "No se pudo recuperar el certificado SSL del destino.",
          });
          return;
        }

        const validTo = new Date(cert.valid_to);
        const daysRemaining = Math.round((validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

        const output = {
          host,
          subject: cert.subject?.CN || "Desconocido",
          issuer: cert.issuer?.O || cert.issuer?.CN || "Desconocido",
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
          daysRemaining,
          protocol,
          cipher: cipher?.name || "Desconocido",
        };

        const findings: Finding[] = [];

        if (daysRemaining < 15) {
          findings.push({
            severity: "high",
            confidence: 0.99,
            title: `Certificado SSL Próximo a Expirar (${daysRemaining} días)`,
            description: `El certificado SSL/TLS del sitio expira en apenas ${daysRemaining} días. En cuanto expire, todos los navegadores bloquearán el acceso a sus usuarios mostrando advertencias de seguridad críticas.`,
            recommendation: "Es indispensable renovar de inmediato el certificado TLS del servidor.",
            affectedAsset: host,
            evidence: { daysRemaining },
          });
        }

        if (protocol && (protocol === "TLSv1" || protocol === "TLSv1.1")) {
          findings.push({
            severity: "high",
            confidence: 1.0,
            title: "Protocolo Criptográfico Obsoleto TLSv1/TLSv1.1",
            description: "El servidor de destino acepta conexiones mediante versiones obsoletas de TLS. Estos protocolos contienen vulnerabilidades de diseño severas que permiten la interceptación de tráfico.",
            recommendation: "Deshabilite el soporte de TLS 1.0 y 1.1 en la configuración del servidor web, forzando TLS 1.2 o superior.",
            affectedAsset: host,
            evidence: { protocol },
          });
        }

        resolve({ success: true, output, findings });
      });

      socket.on("error", (err) => {
        socket.destroy();
        resolve({
          success: false,
          output: { host },
          findings: [],
          error: `Error estableciendo sesión TLS segura: ${err.message}`,
        });
      });

      socket.setTimeout(5000, () => {
        socket.destroy();
        resolve({
          success: false,
          output: { host },
          findings: [],
          error: "Tiempo de espera agotado al conectar por TLS (Timeout).",
        });
      });
    });
  },
};

/**
 * 4. Robots.txt Analysis Executor
 */
export const websiteRobotsExecutor: ToolExecutor<{ url: string }, any> = {
  id: "website.robots",
  timeoutMs: 12000,
  category: "website",
  validate(input: unknown) {
    return urlSchema.parse(input);
  },
  async execute(ctx: ExecutionContext, { url }): Promise<ExecutionResult<any>> {
    ctx.log(`Analizando robots.txt para: ${url}`);
    const parsed = new URL(url);
    await assertPublicHostname(parsed.hostname);

    const robotsUrl = `${parsed.origin}/robots.txt`;
    let content = "";
    try {
      const res = await safeFetch(robotsUrl);
      if (res.ok) {
        content = await res.text();
      }
    } catch {
      // Ignorar fallos de conexión a robots.txt
    }

    const output = {
      url: robotsUrl,
      hasRobots: !!content,
      content,
    };

    const findings: Finding[] = [];

    if (content) {
      const lines = content.split("\n");
      const sensitiveKeywords = ["admin", "wp-admin", "login", "config", "backup", "db", "private", "staging", "dev"];
      const exposedPaths: string[] = [];

      for (const line of lines) {
        if (line.toLowerCase().startsWith("disallow:")) {
          const path = line.substring(9).trim();
          if (sensitiveKeywords.some((kw) => path.toLowerCase().includes(kw))) {
            exposedPaths.push(path);
          }
        }
      }

      if (exposedPaths.length > 0) {
        findings.push({
          severity: "low",
          confidence: 0.8,
          title: "Directivas de Robots.txt Revelan Rutas Sensibles",
          description: `El archivo robots.txt indica directivas 'Disallow' para rutas potencialmente sensibles (${exposedPaths.slice(0, 3).join(", ")}...). Aunque busca evitar que buscadores las indexen, atacantes y rastreadores maliciosos analizan este archivo público para localizar consolas de administración o archivos de configuración.`,
          recommendation: "En lugar de bloquear directorios sensibles mediante Robots.txt, aplique autenticación robusta y la cabecera 'X-Robots-Tag: noindex' en la respuesta HTTP de dichas páginas.",
          affectedAsset: robotsUrl,
          evidence: { exposedPaths },
        });
      }
    }

    return { success: true, output, findings };
  },
};
