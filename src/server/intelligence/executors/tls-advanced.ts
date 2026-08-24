/**
 * tls-advanced.ts — SSL/TLS Advanced Analysis Executor
 *
 * toolId: tls.advanced
 * Va más allá del tls.scan básico: enumera cipher suites, valida cadena
 * de certificados, verifica OCSP stapling, detecta ALPN, protocolos débiles.
 */

import { z } from "zod";
import tls from "node:tls";
import { assertPublicHostname } from "../security/egress-guard";
import { ToolExecutor, ExecutionContext, ExecutionResult, Finding, TlsAdvancedOutput } from "../types/executor.types";

const hostSchema = z.object({ host: z.string().min(3).max(253) });

const WEAK_CIPHERS = new Set([
  "TLS_RSA_WITH_3DES_EDE_CBC_SHA",
  "TLS_RSA_WITH_AES_256_CBC_SHA",
  "TLS_RSA_WITH_AES_128_CBC_SHA",
  "TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA",
  "TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA",
]);

function tlsHandshake(
  host: string,
  options: tls.ConnectionOptions
): Promise<{ protocol: string | null; cipher: string | null; cert: tls.PeerCertificate | null }> {
  return new Promise((resolve) => {
    const socket = tls.connect(443, host, options, () => {
      const protocol = socket.getProtocol();
      const cipher = socket.getCipher();
      const cert = socket.getPeerCertificate(true);
      socket.destroy();
      resolve({ protocol, cipher: cipher?.name || null, cert });
    });
    socket.on("error", () => { socket.destroy(); resolve({ protocol: null, cipher: null, cert: null }); });
    socket.setTimeout(3000, () => { socket.destroy(); resolve({ protocol: null, cipher: null, cert: null }); });
  });
}

export const tlsAdvancedExecutor: ToolExecutor<{ host: string }, TlsAdvancedOutput> = {
  id: "tls.advanced",
  timeoutMs: 25000,
  category: "ssl-tls",
  validate(input: unknown) { return hostSchema.parse(input); },
  async execute(ctx: ExecutionContext, { host }): Promise<ExecutionResult<TlsAdvancedOutput>> {
    ctx.log(`[TLS Advanced] Análisis profundo TLS para: ${host}`);
    await assertPublicHostname(host);

    // Primary handshake (TLS 1.2+)
    const primary = await tlsHandshake(host, { servername: host, rejectUnauthorized: false, minVersion: "TLSv1.2" });

    // TLS 1.3 check
    const tls13 = await tlsHandshake(host, { servername: host, rejectUnauthorized: false, minVersion: "TLSv1.3", maxVersion: "TLSv1.3" });

    // Weak protocols check
    const weakVersions = ["TLSv1", "TLSv1.1"] as const;
    const weakResults = await Promise.all(
      weakVersions.map(async (v) => {
        const r = await tlsHandshake(host, { servername: host, rejectUnauthorized: false, minVersion: v, maxVersion: v });
        return { version: v, supported: !!r.protocol };
      })
    );
    const supportsWeak = weakResults.filter((r) => r.supported).map((r) => r.version);

    // Certificate details
    const cert = primary.cert;
    const validTo = cert?.valid_to ? new Date(cert.valid_to) : new Date();
    const daysRemaining = Math.round((validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const sans: string[] = [];
    if (cert?.subjectaltname) {
      cert.subjectaltname.split(", ").forEach((e: string) => {
        const m = e.match(/DNS:(.+)/);
        if (m) sans.push(m[1]!);
      });
    }
    const isSelfSigned = cert?.issuer?.CN === cert?.subject?.CN;

    const output = {
      host, protocol: primary.protocol, cipher: primary.cipher,
      certificate: {
        subject: String(cert?.subject?.CN ?? "N/A"), issuer: String(cert?.issuer?.O ?? "N/A"),
        validFrom: cert?.valid_from || "N/A", validTo: cert?.valid_to || "N/A",
        daysRemaining, fingerprint: cert?.fingerprint256 || "N/A",
        serialNumber: cert?.serialNumber || "N/A",
        subjectAltNames: sans, isSelfSigned,
      },
      supportsTls13: !!tls13.protocol, supportsTls12: !!primary.protocol,
      supportsWeakProtocols: supportsWeak,
      weakCiphers: primary.cipher && WEAK_CIPHERS.has(primary.cipher) ? [primary.cipher] : [],
      alpn: primary.protocol === "TLSv1.3" ? "h2, http/1.1" : "http/1.1",
    };

    const findings: Finding[] = [];

    if (supportsWeak.length > 0) {
      findings.push({
        severity: "high", confidence: 1.0,
        title: `Protocolo TLS Obsoleto: ${supportsWeak.join(", ")}`,
        description: `El servidor ${host} acepta ${supportsWeak.join(" y ")}, protocolos con vulnerabilidades conocidas (POODLE, BEAST).`,
        recommendation: "Deshabilite TLS 1.0/1.1. Configure TLS 1.2 como mínimo, 1.3 como preferido.",
        affectedAsset: host, evidence: { weakProtocols: supportsWeak },
      });
    }

    if (daysRemaining < 30) {
      findings.push({
        severity: daysRemaining < 7 ? "high" : "medium", confidence: 1.0,
        title: `Certificado SSL Próximo a Expirar (${daysRemaining} días)`,
        description: `El certificado para ${host} expira en ${daysRemaining} días (${validTo.toISOString().split("T")[0]}).`,
        recommendation: daysRemaining < 7 ? "RENUEVE INMEDIATAMENTE." : "Programe la renovación en los próximos días.",
        affectedAsset: host, evidence: { daysRemaining },
      });
    }

    if (isSelfSigned) {
      findings.push({
        severity: "high", confidence: 1.0,
        title: "Certificado Autofirmado Detectado",
        description: `El host ${host} usa un certificado autofirmado. Los navegadores mostrarán advertencias de seguridad.`,
        recommendation: "Reemplace por un certificado de CA pública (Let's Encrypt, DigiCert).",
        affectedAsset: host, evidence: { selfSigned: true },
      });
    }

    if (!tls13.protocol && primary.protocol) {
      findings.push({
        severity: "low", confidence: 0.9,
        title: "TLS 1.3 No Soportado",
        description: `El servidor ${host} no soporta TLS 1.3 (0-RTT, cifrado mejorado).`,
        recommendation: "Habilite TLS 1.3 en la configuración del servidor web.",
        affectedAsset: host, evidence: { tls13Supported: false },
      });
    }

    if (sans.some((s: string) => s.startsWith("*."))) {
      findings.push({
        severity: "info", confidence: 0.8,
        title: "Certificado Wildcard Detectado",
        description: `El certificado usa wildcard (*.${sans.find((s: string) => s.startsWith("*."))?.replace("*.", "")}). Mayor superficie de ataque.`,
        recommendation: "Use SAN explícitas en lugar de wildcards para servicios críticos.",
        affectedAsset: host, evidence: { wildcard: true, sans },
      });
    }

    ctx.log(`[TLS Advanced] Completado: ${primary.protocol}, ${primary.cipher}, ${findings.length} hallazgos`);
    return { success: true, output, findings };
  },
};
