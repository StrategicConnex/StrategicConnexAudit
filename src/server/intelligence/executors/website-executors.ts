import { z } from "zod";
import tls from "node:tls";
import { assertPublicHostname, safeFetch } from "../security/egress-guard";
import {
  ToolExecutor, ExecutionContext, ExecutionResult, Finding, TlsScanOutput,
  WebsiteHeadersOutput, WebsiteSecurityHeadersOutput, WebsiteRobotsOutput,
  WebsiteRedirectsOutput, WebsiteCookiesOutput, WebsiteCspOutput,
} from "../types/executor.types";

const urlSchema = z.object({ url: z.string().url() });
const hostSchema = z.object({ host: z.string().min(3).max(253) });

/**
 * 1. HTTP Headers Executor
 */
export const websiteHeadersExecutor: ToolExecutor<{ url: string }, WebsiteHeadersOutput> = {
  id: "website.headers",
  timeoutMs: 12000,
  category: "website",
  validate(input: unknown) {
    return urlSchema.parse(input);
  },
  async execute(ctx: ExecutionContext, { url }): Promise<ExecutionResult<WebsiteHeadersOutput>> {
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
        output: { url, status: 0, statusText: "Error", headers: {} },
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
export const websiteSecurityHeadersExecutor: ToolExecutor<{ url: string }, WebsiteSecurityHeadersOutput> = {
  id: "website.security_headers",
  timeoutMs: 12000,
  category: "website",
  validate(input: unknown) {
    return urlSchema.parse(input);
  },
  async execute(ctx: ExecutionContext, { url }): Promise<ExecutionResult<WebsiteSecurityHeadersOutput>> {
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
          output: { url, hsts: null, csp: null, xfo: null, xcto: null, rp: null },
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
export const websiteTlsExecutor: ToolExecutor<{ host: string }, TlsScanOutput> = {
  id: "tls.scan",
  timeoutMs: 15000,
  category: "ssl-tls",
  validate(input: unknown) {
    return hostSchema.parse(input);
  },
  async execute(ctx: ExecutionContext, { host }): Promise<ExecutionResult<TlsScanOutput>> {
    ctx.log(`Realizando Handshake TLS seguro para: ${host}`);
    await assertPublicHostname(host);

    // Output de error tipado: contrato completo para que ExecutionResult<TlsScanOutput>
    // compile sin `as any`. scan-response solo lee estos campos cuando success=true.
    const errorOutput = (): TlsScanOutput => ({
      host,
      subject: "Desconocido",
      issuer: "Desconocido",
      validFrom: "",
      validTo: "",
      daysRemaining: 0,
      protocol: undefined,
      cipher: "Desconocido",
    });

    return new Promise((resolve) => {
      // SECURITY: rejectUnauthorized: false es INTENCIONAL. Somos un escáner de certificados TLS.
      // Necesitamos leer el certificado incluso si es autofirmado o tiene una cadena de confianza
      // incompleta. NO usar esta conexión para comunicaciones sensibles con el host.
      const socket = tls.connect(443, host, { servername: host, rejectUnauthorized: false }, () => {
        const cert: any = socket.getPeerCertificate(true);
        const protocol = socket.getProtocol();
        const cipher = socket.getCipher();

        socket.destroy();

        if (!cert || Object.keys(cert).length === 0) {
          resolve({
            success: false,
            output: errorOutput(),
            findings: [],
            error: "No se pudo recuperar el certificado SSL del destino.",
          });
          return;
        }

        const validTo = new Date(cert.valid_to);
        const daysRemaining = Math.round((validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

        const output: TlsScanOutput = {
          host,
          subject: cert.subject?.CN || "Desconocido",
          issuer: cert.issuer?.O || cert.issuer?.CN || "Desconocido",
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
          daysRemaining,
          protocol: protocol ?? undefined,
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
          output: errorOutput(),
          findings: [],
          error: `Error estableciendo sesión TLS segura: ${err.message}`,
        });
      });

      socket.setTimeout(5000, () => {
        socket.destroy();
        resolve({
          success: false,
          output: errorOutput(),
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
export const websiteRobotsExecutor: ToolExecutor<{ url: string }, WebsiteRobotsOutput> = {
  id: "website.robots",
  timeoutMs: 12000,
  category: "website",
  validate(input: unknown) {
    return urlSchema.parse(input);
  },
  async execute(ctx: ExecutionContext, { url }): Promise<ExecutionResult<WebsiteRobotsOutput>> {
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

// ─── 5. Redirect Analysis ──────────────────────────────────────────────────

export const websiteRedirectsExecutor: ToolExecutor<{ url: string }, WebsiteRedirectsOutput> = {
  id: "website.redirects",
  timeoutMs: 15000,
  category: "website",
  validate(input: unknown) { return urlSchema.parse(input); },
  async execute(ctx: ExecutionContext, { url }): Promise<ExecutionResult<WebsiteRedirectsOutput>> {
    ctx.log(`[Redirects] Analizando cadena de redirecciones para: ${url}`);
    const parsed = new URL(url);
    await assertPublicHostname(parsed.hostname);

    const chain: { url: string; status: number; location: string | null }[] = [];
    let currentUrl = url;
    const maxFollow = 10;

    for (let i = 0; i < maxFollow; i++) {
      try {
        const res = await safeFetch(currentUrl, { method: "HEAD" });
        const location = res.headers.get("location");
        chain.push({ url: currentUrl, status: res.status, location });

        if (res.status < 300 || res.status >= 400) break;
        if (!location) break;
        currentUrl = new URL(location, currentUrl).href;
      } catch (e: any) {
        chain.push({ url: currentUrl, status: 0, location: null });
        break;
      }
    }

    const redirectCount = chain.filter((c) => c.status >= 300 && c.status < 400).length;
    const finalStatus = chain[chain.length - 1]?.status || 0;
    const hasHttpsUpgrade = chain.some((c) => c.url.startsWith("http://") && c.location?.startsWith("https://"));
    const hasChainLoops = chain.length >= maxFollow;

    const output = {
      url,
      chain,
      redirectCount,
      finalStatus,
      hasHttpsUpgrade,
      hasChainLoops,
    };

    const findings: Finding[] = [];

    if (redirectCount > 3) {
      findings.push({
        severity: "medium", confidence: 0.9,
        title: "Cadena de Redirecciones Excesiva",
        description: `La URL ${url} requiere ${redirectCount} redirecciones antes de llegar al destino final. Las cadenas largas degradan el rendimiento SEO y la experiencia de usuario.`,
        recommendation: "Reduzca la cadena de redirecciones actualizando los enlaces directos al destino final siempre que sea posible.",
        affectedAsset: url,
        evidence: { redirectCount, chain: chain.map((c) => `${c.status} ${c.url}`) },
      });
    }

    if (!hasHttpsUpgrade && url.startsWith("http://")) {
      findings.push({
        severity: "high", confidence: 0.95,
        title: "Redirección HTTPS Ausente",
        description: `La URL ${url} se sirve sobre HTTP y no redirige automáticamente a HTTPS. Los usuarios pueden conectarse sin cifrado.`,
        recommendation: "Configure una redirección 301 permanente de HTTP a HTTPS en su servidor web o CDN.",
        affectedAsset: url,
        evidence: { hasHttpsUpgrade: false },
      });
    }

    if (hasChainLoops) {
      findings.push({
        severity: "critical", confidence: 1.0,
        title: "Posible Bucle de Redirecciones",
        description: `Se detectaron ${maxFollow} o más redirecciones consecutivas, lo que sugiere un bucle de redirecciones. Los navegadores mostrarán un error "too many redirects".`,
        recommendation: "Revise la configuración de redirecciones en su servidor web, CDN y framework para eliminar el bucle.",
        affectedAsset: url,
        evidence: { chain: chain.map((c) => `${c.status} ${c.url}`) },
      });
    }

    ctx.log(`[Redirects] ${url}: ${redirectCount} redirecciones, status final ${finalStatus}`);
    return { success: true, output, findings };
  },
};

// ─── 6. Cookie Analysis ────────────────────────────────────────────────────

export const websiteCookiesExecutor: ToolExecutor<{ url: string }, WebsiteCookiesOutput> = {
  id: "website.cookies",
  timeoutMs: 12000,
  category: "website",
  validate(input: unknown) { return urlSchema.parse(input); },
  async execute(ctx: ExecutionContext, { url }): Promise<ExecutionResult<WebsiteCookiesOutput>> {
    ctx.log(`[Cookies] Analizando cookies para: ${url}`);
    const parsed = new URL(url);
    await assertPublicHostname(parsed.hostname);

    let setCookieHeaders: string[] = [];
    try {
      const res = await safeFetch(url, { method: "GET", redirect: "follow" });
      setCookieHeaders = res.headers.getSetCookie?.() || [];
      if (setCookieHeaders.length === 0) {
        // Fallback if getSetCookie not available
        const raw = res.headers.get("set-cookie");
        if (raw) setCookieHeaders = [raw];
      }
    } catch (e: any) {
      ctx.log(`Error fetching cookies: ${e.message}`);
      return { success: false, output: { url, cookies: [], cookieCount: 0 }, findings: [], error: `Error al analizar cookies: ${e.message}` };
    }

    interface CookieInfo {
      name: string;
      hasSecure: boolean;
      hasHttpOnly: boolean;
      hasSameSite: boolean;
      sameSiteValue: string;
      hasExpiry: boolean;
    }

    const cookies: CookieInfo[] = setCookieHeaders.map((header) => {
      const parts = header.split(";").map((p) => p.trim());
      const name = parts[0]?.split("=")[0] || "unknown";
      const lower = header.toLowerCase();
      const sameSitePart = parts.find((p) => p.toLowerCase().startsWith("samesite="));
      return {
        name,
        hasSecure: lower.includes("secure"),
        hasHttpOnly: lower.includes("httponly"),
        hasSameSite: !!sameSitePart,
        sameSiteValue: sameSitePart?.split("=")[1]?.toLowerCase() || "",
        hasExpiry: lower.includes("expires=") || lower.includes("max-age="),
      };
    });

    const output = {
      url,
      cookies,
      cookieCount: cookies.length,
    };

    const findings: Finding[] = [];

    for (const cookie of cookies) {
      if (!cookie.hasSecure) {
        findings.push({
          severity: "medium", confidence: 0.95,
          title: `Cookie "${cookie.name}" sin flag Secure`,
          description: `La cookie "${cookie.name}" se envía sin el flag Secure. Puede ser transmitida por conexiones HTTP no cifradas, exponiéndola a interceptación (session hijacking).`,
          recommendation: "Agregue el flag 'Secure' a todas las cookies que contengan información de sesión o sensible.",
          affectedAsset: url,
          evidence: { cookie: cookie.name, missingFlag: "Secure" },
        });
      }
      if (!cookie.hasHttpOnly) {
        findings.push({
          severity: "medium", confidence: 0.9,
          title: `Cookie "${cookie.name}" sin flag HttpOnly`,
          description: `La cookie "${cookie.name}" es accesible desde JavaScript del lado del cliente. Esto la hace vulnerable a robo mediante XSS (Cross-Site Scripting).`,
          recommendation: "Agregue el flag 'HttpOnly' a las cookies de sesión para que no sean accesibles desde JavaScript.",
          affectedAsset: url,
          evidence: { cookie: cookie.name, missingFlag: "HttpOnly" },
        });
      }
      if (!cookie.hasSameSite) {
        findings.push({
          severity: "low", confidence: 0.8,
          title: `Cookie "${cookie.name}" sin atributo SameSite`,
          description: `La cookie "${cookie.name}" no especifica la directiva SameSite. Los navegadores modernos aplican SameSite=Lax por defecto, pero puede haber comportamiento inconsistente.`,
          recommendation: "Agregue el atributo 'SameSite=Lax' o 'SameSite=Strict' según los requisitos de su aplicación.",
          affectedAsset: url,
          evidence: { cookie: cookie.name, missingFlag: "SameSite" },
        });
      }
    }

    ctx.log(`[Cookies] ${url}: ${cookies.length} cookie(s) analizadas`);
    return { success: true, output, findings };
  },
};

// ─── 7. CSP Analysis ───────────────────────────────────────────────────────

export const websiteCspExecutor: ToolExecutor<{ url: string }, WebsiteCspOutput> = {
  id: "website.csp",
  timeoutMs: 12000,
  category: "website",
  validate(input: unknown) { return urlSchema.parse(input); },
  async execute(ctx: ExecutionContext, { url }): Promise<ExecutionResult<WebsiteCspOutput>> {
    ctx.log(`[CSP] Analizando Content-Security-Policy para: ${url}`);
    const parsed = new URL(url);
    await assertPublicHostname(parsed.hostname);

    let cspHeader = "";
    try {
      const res = await safeFetch(url, { method: "HEAD", redirect: "follow" });
      cspHeader = res.headers.get("content-security-policy") ||
                  res.headers.get("content-security-policy-report-only") || "";

      if (!cspHeader) {
        // Fallback a GET si HEAD no devuelve CSP
        const res2 = await safeFetch(url, { method: "GET", redirect: "follow" });
        cspHeader = res2.headers.get("content-security-policy") ||
                    res2.headers.get("content-security-policy-report-only") || "";
      }
    } catch (e: any) {
      ctx.log(`Error fetching CSP: ${e.message}`);
      return {
        success: false,
        output: { url, csp: null, directives: {}, score: 0, hasUnsafeInline: false, hasUnsafeEval: false, hasWildcardSrc: false, hasStrictDynamic: false, directiveCount: 0 },
        findings: [],
        error: `Error al obtener CSP: ${e.message}`,
      };
    }

    const directives: Record<string, string[]> = {};
    if (cspHeader) {
      const parts = cspHeader.split(";");
      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const spaceIdx = trimmed.indexOf(" ");
        const name = spaceIdx > 0 ? trimmed.substring(0, spaceIdx) : trimmed;
        const value = spaceIdx > 0 ? trimmed.substring(spaceIdx + 1).trim() : "";
        directives[name] = value ? value.split(/\s+/).filter(Boolean) : [];
      }
    }

    const hasUnsafeInline = Object.values(directives).some((vals) =>
      vals.some((v) => v === "'unsafe-inline'")
    );
    const hasUnsafeEval = Object.values(directives).some((vals) =>
      vals.some((v) => v === "'unsafe-eval'")
    );
    const hasWildcardSrc = Object.values(directives).some((vals) =>
      vals.some((v) => v === "*" || v === "http://*" || v === "https://*")
    );
    const hasStrictDynamic = Object.values(directives).some((vals) =>
      vals.some((v) => v === "'strict-dynamic'")
    );

    const score = cspHeader
      ? Math.max(0, Math.min(100,
          100
          - (hasUnsafeInline ? 25 : 0)
          - (hasUnsafeEval ? 15 : 0)
          - (hasWildcardSrc ? 20 : 0)
          + (hasStrictDynamic ? 10 : 0)
        ))
      : 0;

    const output = {
      url,
      csp: cspHeader || null,
      directives,
      score,
      hasUnsafeInline,
      hasUnsafeEval,
      hasWildcardSrc,
      hasStrictDynamic,
      directiveCount: Object.keys(directives).length,
    };

    const findings: Finding[] = [];

    if (!cspHeader) {
      findings.push({
        severity: "high", confidence: 1.0,
        title: "Content-Security-Policy Ausente",
        description: `El sitio ${url} no envía ninguna cabecera Content-Security-Policy. Sin CSP, los navegadores no pueden mitigar ataques XSS y de inyección de datos.`,
        recommendation: "Implemente la cabecera Content-Security-Policy con directivas restrictivas para script-src, style-src y object-src.",
        affectedAsset: url,
        evidence: { cspScore: 0 },
      });
    } else {
      if (hasUnsafeInline) {
        findings.push({
          severity: "high", confidence: 0.95,
          title: "CSP permite 'unsafe-inline'",
          description: "La política CSP incluye 'unsafe-inline' en una o más directivas, lo que permite la ejecución de scripts inline y reduce significativamente la protección contra XSS.",
          recommendation: "Elimine 'unsafe-inline' y use nonces o hashes para scripts inline legítimos. Considere 'strict-dynamic' como alternativa moderna.",
          affectedAsset: url,
          evidence: { directives: Object.entries(directives).filter(([, v]) => v.includes("'unsafe-inline'")).map(([k]) => k) },
        });
      }
      if (hasWildcardSrc) {
        findings.push({
          severity: "medium", confidence: 0.9,
          title: "CSP contiene comodín (*) en fuentes",
          description: "La política CSP utiliza comodines (*) en una o más directivas, permitiendo la carga de recursos desde cualquier origen. Esto debilita significativamente la política.",
          recommendation: "Reemplace los comodines con orígenes específicos. Por ejemplo, use 'self' en lugar de *.",
          affectedAsset: url,
          evidence: { directives: Object.entries(directives).filter(([, v]) => v.includes("*")).map(([k]) => k) },
        });
      }
      if (score < 50) {
        findings.push({
          severity: "medium", confidence: 0.85,
          title: "Score CSP Bajo",
          description: `La política CSP tiene un score de ${score}/100. Existen múltiples debilidades que reducen la efectividad de la protección contra XSS.`,
          recommendation: "Revise y fortalezca la política CSP eliminando unsafe-inline, unsafe-eval y comodines.",
          affectedAsset: url,
          evidence: { cspScore: score },
        });
      }
    }

    ctx.log(`[CSP] ${url}: ${cspHeader ? `Score ${score}/100` : "Ausente"}`);
    return { success: true, output, findings };
  },
};

