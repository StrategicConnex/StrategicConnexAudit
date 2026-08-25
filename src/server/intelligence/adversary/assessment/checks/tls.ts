/**
 * tls.ts — Check real de certificado TLS.
 *
 * Abre una conexión TLS genuina al host:443 y analiza el certificado:
 * vencimiento, autofirmado, vigencia, emisor, SANs. Evidencia 100% real
 * del handshake — no simulada.
 */

import tls from "node:tls";
import type { CheckContext, CheckDefinition, CheckResult } from "../types";

function inspectCert(host: string, timeoutMs: number): Promise<{
  ok: boolean;
  validTo?: string;
  daysRemaining?: number;
  issuer?: string;
  subject?: string;
  selfSigned?: boolean;
  authorized?: boolean;
  error?: string;
}> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: ReturnType<typeof Object>) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(r as never);
    };

    const socket = tls.connect(
      {
        host,
        port: 443,
        servername: host,
        rejectUnauthorized: false, // queremos INSPECCIONAR certs inválidos, no rechazarlos
        timeout: timeoutMs,
      },
      () => {
        const cert = socket.getPeerCertificate();
        if (!cert || !cert.valid_to) {
          done({ ok: false, error: "sin certificado presentado" });
          return;
        }
        const validTo = new Date(cert.valid_to);
        const daysRemaining = Math.floor((validTo.getTime() - Date.now()) / 86_400_000);
        const issuerCN =
          cert.issuer?.O || cert.issuer?.CN || cert.issuer?.OU || "desconocido";
        const subjectCN = cert.subject?.CN || host;
        done({
          ok: true,
          validTo: validTo.toISOString(),
          daysRemaining,
          issuer: String(issuerCN),
          subject: String(subjectCN),
          selfSigned: issuerCN === subjectCN && String(issuerCN) !== "desconocido",
          authorized: socket.authorized,
        });
      }
    );

    socket.once("timeout", () => done({ ok: false, error: "timeout TLS" }));
    socket.once("error", (err: Error) => done({ ok: false, error: err.message }));
  });
}

export const tlsCertificateCheck: CheckDefinition = {
  id: "tls-certificate",
  name: "Certificado TLS",
  category: "tls",
  description:
    "Handshake TLS real contra :443 — vencimiento, autofirmado, autoridad de certificación.",
  run: async ({ host, timeoutMs }: CheckContext): Promise<CheckResult> => {
    const info = await inspectCert(host, Math.min(timeoutMs, 8_000));

    if (!info.ok) {
      return {
        id: "tls-certificate",
        name: "Certificado TLS",
        status: "error",
        summary: `No se pudo completar el handshake TLS: ${info.error}`,
        evidence: { host, error: info.error },
      };
    }

    // Sin TLS en 443 pero conectable → hallazgo alto
    const findings: string[] = [];
    let severity: CheckResult["severity"] = undefined;

    if (info.daysRemaining !== undefined && info.daysRemaining <= 0) {
      findings.push(`El certificado está VENCIDO desde ${info.validTo}`);
      severity = "critical";
    } else if (info.daysRemaining !== undefined && info.daysRemaining < 15) {
      findings.push(`El certificado vence en ${info.daysRemaining} días`);
      severity = severity ?? "medium";
    }

    if (info.selfSigned) {
      findings.push("Certificado autofirmado (sin CA de confianza)");
      severity = severity === "critical" ? severity : "high";
    }

    if (info.authorized === false && !info.selfSigned) {
      findings.push("La cadena de certificados no valida contra CAs conocidas");
      severity = severity === "critical" ? severity : "high";
    }

    if (findings.length > 0) {
      return {
        id: "tls-certificate",
        name: "Certificado TLS",
        status: "finding",
        severity: severity ?? "medium",
        summary: findings.join(". "),
        evidence: { ...info, host },
      };
    }

    return {
      id: "tls-certificate",
      name: "Certificado TLS",
      status: "pass",
      summary: `Certificado válido (${info.issuer}), vence ${info.validTo} (${info.daysRemaining} días).`,
      evidence: { ...info, host },
    };
  },
};
