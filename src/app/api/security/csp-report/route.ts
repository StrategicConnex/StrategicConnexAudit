import { NextRequest, NextResponse } from "next/server";
import { logSecurityEvent } from "@/shared/lib/audit-log";
import { withRateLimit } from "@/shared/lib/ratelimit";

export const dynamic = "force-dynamic";

/** Tamaño máximo aceptado del reporte (los navegadores envían < 4KB). */
const MAX_REPORT_BYTES = 16_384;

/**
 * POST /api/security/csp-report
 *
 * Endpoint que recibe reportes de violaciones CSP del navegador.
 * Los navegadores POSTean un cuerpo JSON cuando una directiva CSP se viola
 * (configurado via report-uri /api/security/csp-report en proxy.ts).
 *
 * Log estructurado de cada violación para auditoría de seguridad.
 *
 * Rate-limited por IP (30/min): sin este límite el endpoint es un sumidero
 * público que inserta una fila en security_audit_logs por request
 * (vector de flooding/DB-bloat).
 */
export const POST = withRateLimit<NextRequest>(
  { limit: 30, window: 60, prefix: "csp_report" },
  async (req) => {
    try {
      const contentLength = Number(req.headers.get("content-length") || "0");
      if (contentLength > MAX_REPORT_BYTES) {
        // Cuerpo anormalmente grande: descartar sin persistir.
        return new NextResponse(null, { status: 204 });
      }

      const report = await req.json().catch(() => ({}));

      const cspReport = report["csp-report"] || report;

      if (cspReport && typeof cspReport === "object") {
        logSecurityEvent("csp_violation", {
          ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown",
          path: "/api/security/csp-report",
          method: "POST",
          userAgent: req.headers.get("user-agent") || undefined,
          metadata: {
            blockedUri: cspReport["blocked-uri"] || "unknown",
            documentUri: cspReport["document-uri"] || "unknown",
            violatedDirective: cspReport["violated-directive"] || "unknown",
            effectiveDirective: cspReport["effective-directive"] || "unknown",
            originalPolicy: cspReport["original-policy"]?.substring(0, 200) || "unknown",
            sourceFile: cspReport["source-file"] || undefined,
            lineNumber: cspReport["line-number"] || undefined,
            columnNumber: cspReport["column-number"] || undefined,
            sample: cspReport["script-sample"]?.substring(0, 100) || undefined,
          },
        });
      }

      // CSP reports always return 204 (no content) per spec
      return new NextResponse(null, { status: 204 });
    } catch {
      // Fail-safe: nunca fallar por un reporte CSP malformado
      return new NextResponse(null, { status: 204 });
    }
  }
);
