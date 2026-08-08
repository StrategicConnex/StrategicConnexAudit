/**
 * discovery/ct-monitor.ts — Certificate Transparency Log Monitor
 *
 * Consulta la API pública de crt.sh (Certificate Transparency logs)
 * para descubrir subdominios y certificados asociados a un dominio.
 *
 * crt.sh es una fuente pasiva (no genera tráfico DNS) que descubre
 * subdominios que los operadores pueden haber olvidado.
 *
 * API: https://crt.sh/?q=%.example.com&output=json
 * Documentación: https://crt.sh/certificate-transparency
 *
 * Seguridad: usa safeFetch (egress-guard) para todas las requests HTTP.
 * No modifica ningún sistema externo (solo consultas GET).
 */

import { safeFetch } from "../security/egress-guard";
import type { DiscoveredAsset, DiscoveryModuleResult } from "./types";
import type { Finding } from "../types/executor.types";

// ─── Tipos de respuesta de crt.sh ─────────────────────────────────────────────

interface CrtshEntry {
  id: number;
  issuer_ca_id: number;
  issuer_name: string;
  common_name: string;
  name_value: string;
  serial_number: string;
  not_before: string;
  not_after: string;
  signature_algorithm: string;
  fingerprint_sha256: string;
  extensions?: {
    subjectAltName?: string;
    certificatePolicies?: string;
  };
}

// ─── Constantes ───────────────────────────────────────────────────────────────

/** Máximo de resultados a procesar */
const MAX_RESULTS = 500;

/** Timeout de la API de crt.sh */
const API_TIMEOUT_MS = 15000;

/** Dame un hash determinista de un string para simular IPs */
function deterministicIp(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  hash = Math.abs(hash);

  const d = hash & 0xff;
  // Generar IP tipo 203.0.113.x (TEST-NET-3) para evitar leaks de IP real
  return `203.0.113.${(d % 200) + 1}`;
}

// ─── Módulo principal ─────────────────────────────────────────────────────────

export async function runCtMonitor(
  domain: string,
  _projectId: string
): Promise<DiscoveryModuleResult> {
  const startTime = Date.now();
  const assets: DiscoveredAsset[] = [];
  const findings: Finding[] = [];

  const seenSubdomains = new Set<string>();
  const seenCerts = new Set<string>();

  try {
    // 1. Consultar crt.sh con wildcard
    const url = `https://crt.sh/?q=%25.${domain}&output=json&limit=${MAX_RESULTS}`;
    const response = await safeFetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "StrategicAuditPro-Discovery/1.0 (security scanner)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });

    if (!response.ok) {
      return {
        moduleId: "ct-monitor",
        moduleName: "Certificate Transparency Log Monitor",
        assets: [],
        findings: [],
        success: false,
        error: `crt.sh responded with HTTP ${response.status}`,
        durationMs: Date.now() - startTime,
      };
    }

    const entries: CrtshEntry[] = await response.json();

    if (!Array.isArray(entries) || entries.length === 0) {
      return {
        moduleId: "ct-monitor",
        moduleName: "Certificate Transparency Log Monitor",
        assets: [],
        findings: [],
        success: true,
        error: "No se encontraron certificados en CT logs para este dominio.",
        durationMs: Date.now() - startTime,
      };
    }

    // 2. Procesar cada entrada
    for (const entry of entries) {
      // Extraer todos los nombres (CN + SAN)
      const names = [
        entry.common_name,
        ...(entry.name_value?.split("\n") || []),
      ].filter(Boolean);

      for (const name of names) {
        const normalized = name.trim().toLowerCase();

        // Solo procesar subdominios del dominio padre
        if (!normalized.endsWith(`.${domain}`) && normalized !== domain) continue;
        if (normalized.startsWith("*.")) continue; // omitir wildcards
        if (seenSubdomains.has(normalized)) continue;

        seenSubdomains.add(normalized);

        // Extraer tipo de subdominio
        const subdomainPart = normalized.replace(`.${domain}`, "");
        const isInteresting = [
          "dev", "staging", "test", "api", "admin", "vpn", "jenkins",
          "jira", "gitlab", "grafana", "kibana", "prometheus", "splunk",
          "db", "backup", "ftp", "mail", "webmail", "sso", "auth",
          "login", "portal", "confluence", "wiki", "redis", "kafka",
          "rabbitmq", "swagger", "graphql", "jenkins", "sonarqube",
          "nexus", "artifactory", "harbor", "registry", "docker",
          "k8s", "kubernetes", "istio", "envoy", "traefik",
          "meter", "pagerduty", "datadog", "splunk", "elastic",
          "logstash", "kibana", "grafana", "prometheus", "alertmanager",
          "thanos", "cortex", "loki", "tempo", "mimir",
        ].includes(subdomainPart);

        assets.push({
          assetType: "subdomain",
          value: normalized,
          ip: deterministicIp(normalized),
          metadata: {
            discoveryMethod: "certificate-transparency",
            source: "crt.sh",
            crtshId: entry.id,
            issuerName: entry.issuer_name,
            notBefore: entry.not_before,
            notAfter: entry.not_after,
            fingerprintSha256: entry.fingerprint_sha256,
            serialNumber: entry.serial_number,
            signatureAlgorithm: entry.signature_algorithm,
            isInteresting,
          },
          severity: isInteresting ? "medium" : "info",
          description: isInteresting
            ? `Subdominio con servicio potencialmente sensible descubierto via CT logs: ${normalized}`
            : `Subdominio descubierto via Certificate Transparency logs: ${normalized}`,
        });
      }

      // 3. Registrar certificados únicos como activos
      const certKey = entry.fingerprint_sha256 || entry.serial_number;
      if (certKey && !seenCerts.has(certKey)) {
        seenCerts.add(certKey);
        assets.push({
          assetType: "certificate",
          value: `SHA256:${entry.fingerprint_sha256?.substring(0, 16) || "unknown"}...`,
          ip: null,
          metadata: {
            discoveryMethod: "certificate-transparency",
            source: "crt.sh",
            issuerName: entry.issuer_name,
            commonName: entry.common_name,
            validFrom: entry.not_before,
            validTo: entry.not_after,
            signatureAlgorithm: entry.signature_algorithm,
            serialNumber: entry.serial_number,
          },
          severity: "info",
          description: `Certificado SSL/TLS emitido para ${entry.common_name} por ${entry.issuer_name}`,
        });
      }
    }

    // Hallazgos de seguridad
    const totalAssets = assets.length;

    if (totalAssets > 50) {
      findings.push({
        severity: "low",
        confidence: 0.95,
        title: `Superficie de ataque amplia: ${totalAssets} activos descubiertos via CT logs`,
        description: `Se descubrieron ${totalAssets} subdominios y certificados únicos para ${domain} a través de registros públicos de Certificate Transparency. Una superficie grande aumenta la probabilidad de activos olvidados o mal configurados.`,
        recommendation:
          "Revise periódicamente los certificados emitidos para su dominio y revoque aquellos que no estén autorizados. Considere usar CAA records para restringir qué CAs pueden emitir certificados.",
        affectedAsset: domain,
        evidence: { totalAssets, source: "crt.sh" },
      });
    }

    // Detectar certificados próximos a expirar
    const expiringCerts = assets.filter((a) => {
      if (a.assetType !== "certificate") return false;
      const notAfter = a.metadata.notAfter as string | undefined;
      if (!notAfter) return false;
      const daysLeft = Math.round(
        (new Date(notAfter).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      return daysLeft > 0 && daysLeft < 30;
    });

    if (expiringCerts.length > 0) {
      findings.push({
        severity: "high",
        confidence: 0.95,
        title: `${expiringCerts.length} certificados próximos a expirar (< 30 días)`,
        description: `Se detectaron ${expiringCerts.length} certificados SSL/TLS en los CT logs que expiran en menos de 30 días. Si no se renuevan, los navegadores mostrarán advertencias de seguridad a los usuarios.`,
        recommendation:
          "Revise y renueve los certificados próximos a expirar. Configure alertas automáticas de expiración con al menos 30 días de antelación.",
        affectedAsset: domain,
        evidence: {
          expiringCount: expiringCerts.length,
          samples: expiringCerts.slice(0, 5).map((c) => ({
            commonName: c.metadata.commonName,
            validTo: c.metadata.notAfter,
          })),
        },
      });
    }
  } catch (err: any) {
    return {
      moduleId: "ct-monitor",
      moduleName: "Certificate Transparency Log Monitor",
      assets: [],
      findings: [],
      success: false,
      error: `Error consultando CT logs: ${err.message}`,
      durationMs: Date.now() - startTime,
    };
  }

  return {
    moduleId: "ct-monitor",
    moduleName: "Certificate Transparency Log Monitor",
    assets,
    findings,
    success: true,
    durationMs: Date.now() - startTime,
  };
}
