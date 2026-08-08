/**
 * discovery/shadow-detector.ts — Shadow Asset Detector
 *
 * Descubre activos shadow IT (no autorizados) que pueden representar
 * riesgos de seguridad: buckets cloud expuestos, servicios olvidados,
 * subdominios con certificados expirados, etc.
 *
 * Este módulo NO ejecuta escaneos intrusivos. Usa únicamente fuentes
 * pasivas (DNS, HTTP, APIs públicas) para detectar activos.
 *
 * Seguridad: todas las requests HTTP pasan por safeFetch (egress-guard).
 * No escanea puertos, no realiza conexiones no autorizadas.
 */

import dns from "node:dns/promises";
import { safeFetch } from "../security/egress-guard";
import type { DiscoveredAsset, DiscoveryModuleResult } from "./types";
import type { Finding } from "../types/executor.types";

// ─── Proveedores cloud a detectar ────────────────────────────────────────────

interface CloudBucketPattern {
  provider: string;
  testHost: (subdomain: string) => string;
  detectResponse: (status: number, body: string, headers: Headers) => {
    isBucket: boolean;
    isPublic: boolean;
    detail: string;
  };
}

const CLOUD_BUCKET_PATTERNS: CloudBucketPattern[] = [
  {
    provider: "AWS S3",
    testHost: (sub) => `${sub}.s3.amazonaws.com`,
    detectResponse: (status, body, _headers) => {
      if (status === 200) {
        return {
          isBucket: true,
          isPublic: true,
          detail: "Bucket S3 público (lista de objetos visible)",
        };
      }
      if (status === 403 && body.includes("AccessDenied")) {
        return {
          isBucket: true,
          isPublic: false,
          detail: "Bucket S3 existe pero está privado (HTTP 403)",
        };
      }
      if (status === 404) {
        return {
          isBucket: false,
          isPublic: false,
          detail: "No se encontró bucket S3",
        };
      }
      return {
        isBucket: status !== 404,
        isPublic: status === 200,
        detail: `Respuesta HTTP ${status}`,
      };
    },
  },
  {
    provider: "AWS S3 (EU)",
    testHost: (sub) => `${sub}.s3.eu-west-1.amazonaws.com`,
    detectResponse: (status, _body, _headers) => ({
      isBucket: status !== 404,
      isPublic: status === 200,
      detail: `Respuesta HTTP ${status}`,
    }),
  },
  {
    provider: "Google Cloud Storage",
    testHost: (sub) => `${sub}.storage.googleapis.com`,
    detectResponse: (status, _body, _headers) => {
      if (status === 200) {
        return {
          isBucket: true,
          isPublic: true,
          detail: "GCS bucket público (lista de objetos visible)",
        };
      }
      if (status === 403) {
        return {
          isBucket: true,
          isPublic: false,
          detail: "GCS bucket existe pero requiere autenticación",
        };
      }
      return {
        isBucket: status !== 404,
        isPublic: status === 200,
        detail: `Respuesta HTTP ${status}`,
      };
    },
  },
  {
    provider: "Azure Blob Storage",
    testHost: (sub) => `${sub}.blob.core.windows.net`,
    detectResponse: (status, body, _headers) => ({
      isBucket: status !== 404 && !body.includes("not found"),
      isPublic: status === 200,
      detail: `Respuesta HTTP ${status}`,
    }),
  },
  {
    provider: "DigitalOcean Spaces",
    testHost: (sub) => `${sub}.nyc3.digitaloceanspaces.com`,
    detectResponse: (status, _body, _headers) => ({
      isBucket: status !== 404,
      isPublic: status === 200,
      detail: `Respuesta HTTP ${status}`,
    }),
  },
];

// ─── Timeouts ─────────────────────────────────────────────────────────────────

const HTTP_TIMEOUT_MS = 5000;
const DNS_TIMEOUT_MS = 3000;

// ─── Módulo principal ─────────────────────────────────────────────────────────

export async function runShadowDetection(
  domain: string,
  projectId: string,
  discoveredSubdomains: string[]
): Promise<DiscoveryModuleResult> {
  const startTime = Date.now();
  const assets: DiscoveredAsset[] = [];
  const findings: Finding[] = [];

  const subdomainsToCheck = [
    domain,
    `www.${domain}`,
    `app.${domain}`,
    `api.${domain}`,
    `dev.${domain}`,
    `staging.${domain}`,
    `admin.${domain}`,
    `mail.${domain}`,
    `blog.${domain}`,
    `cdn.${domain}`,
    ...discoveredSubdomains.map((s) => {
      // Extraer solo subdominio, quitar IP
      const parts = s.replace(`.${domain}`, "");
      return `${parts}.${domain}`;
    }),
  ];

  // Solo checkear los primeros 30 para no saturar
  const uniqueSubs = [...new Set(subdomainsToCheck)].slice(0, 30);

  // ─── 1. Detectar buckets cloud expuestos ───────────────────────────────────
  for (const sub of uniqueSubs) {
    const subPrefix = sub.replace(`.${domain}`, "").replace(/[^a-zA-Z0-9-]/g, "-");

    for (const pattern of CLOUD_BUCKET_PATTERNS) {
      const hostname = pattern.testHost(subPrefix.toLowerCase());

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

        const response = await safeFetch(`https://${hostname}`, {
          method: "GET",
          signal: controller.signal,
          headers: {
            "User-Agent": "StrategicAuditPro-Discovery/1.0",
          },
        });

        clearTimeout(timeoutId);
        const body = await response.text().catch(() => "");

        const { isBucket, isPublic, detail } = pattern.detectResponse(
          response.status,
          body,
          response.headers
        );

        if (isBucket) {
          assets.push({
            assetType: "cloud_bucket",
            value: `${pattern.provider}://${subPrefix}`,
            ip: null,
            metadata: {
              provider: pattern.provider,
              hostname,
              statusCode: response.status,
              isPublic,
              detail,
              discoveredVia: "shadow-detection",
              sourceDomain: sub,
            },
            severity: isPublic ? "high" : "info",
            description: isPublic
              ? `Bucket cloud ${pattern.provider} expuesto públicamente: ${subPrefix}`
              : `Bucket cloud ${pattern.provider} detectado (privado): ${subPrefix}`,
          });

          if (isPublic) {
            findings.push({
              severity: "high",
              confidence: 0.95,
              title: `Bucket ${pattern.provider} Públicamente Accesible`,
              description: `Se detectó un bucket de almacenamiento ${pattern.provider} (${subPrefix}) que permite acceso de lectura anónimo. Esto puede exponer datos sensibles, configuraciones, backups o credenciales.`,
              recommendation:
                "Revise las políticas de acceso del bucket y restrinja el acceso público. " +
                "Considere usar AWS S3 Block Public Access o equivalente del proveedor.",
              affectedAsset: `${pattern.provider}://${subPrefix}`,
              evidence: { hostname, statusCode: response.status, detail },
            });
          }
        }
      } catch {
        // Si el bucket no existe o hay timeout, continuar
      }
    }
  }

  // ─── 2. Detectar subdominios con DNS válidos pero sin HTTP(S) ──────────────
  for (const sub of uniqueSubs) {
    try {
      // Verificar que resuelve DNS
      const ips = await Promise.race([
        dns.resolve4(sub),
        new Promise<string[]>((_, reject) =>
          setTimeout(() => reject(new Error("DNS timeout")), DNS_TIMEOUT_MS)
        ),
      ]).catch(() => null);

      if (!ips || ips.length === 0) continue;

      // Verificar si responde en HTTPS
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

        const response = await safeFetch(`https://${sub}`, {
          method: "HEAD",
          signal: controller.signal,
          headers: { "User-Agent": "StrategicAuditPro-Discovery/1.0" },
        });

        clearTimeout(timeoutId);

        if (response.status >= 400) {
          assets.push({
            assetType: "dangling_service",
            value: sub,
            ip: ips[0],
            metadata: {
              discoveryMethod: "shadow-detection",
              dnsStatus: "resolves",
              httpStatus: response.status,
              httpStatusText: response.statusText,
              ips,
            },
            severity: "medium",
            description: `Subdominio ${sub} resuelve DNS (${ips[0]}) pero responde HTTP ${response.status} — posible servicio huérfano`,
          });
        }
      } catch {
        // Sin HTTP activo - podría ser servicio no web o muerto
        assets.push({
          assetType: "dangling_service",
          value: sub,
          ip: ips[0],
          metadata: {
            discoveryMethod: "shadow-detection",
            dnsStatus: "resolves",
            httpStatus: null,
            ips,
          },
          severity: "low",
          description: `Subdominio ${sub} resuelve DNS (${ips[0]}) pero no responde en HTTPS — posible servicio apagado o no web`,
        });
      }
    } catch {
      // DNS no resuelve, ignorar
    }
  }

  // ─── 3. Hallazgo general de shadow IT ───────────────────────────────────────
  const publicBuckets = assets.filter(
    (a) => a.assetType === "cloud_bucket" && a.severity === "high"
  );
  const danglingServices = assets.filter((a) => a.assetType === "dangling_service");

  if (publicBuckets.length > 0 || danglingServices.length > 0) {
    const shadowCount = publicBuckets.length + danglingServices.length;
    findings.push({
      severity: shadowCount > 3 ? "high" : "medium",
      confidence: 0.85,
      title: `Shadow IT detectado: ${shadowCount} activos no autorizados`,
      description:
        `Se detectaron ${shadowCount} activos potencialmente no autorizados (Shadow IT) ` +
        `asociados a ${domain}: ${publicBuckets.length} buckets cloud públicos, ` +
        `${danglingServices.length} servicios DNS huérfanos sin HTTP activo. ` +
        "Estos activos no están siendo monitoreados ni gestionados centralmente.",
      recommendation:
        "Realice un inventario completo de activos cloud. Revise cada bucket público y " +
        "servicio DNS huérfano. Implemente políticas de aprovisionamiento que requieran " +
        "aprobación del equipo de seguridad.",
      affectedAsset: domain,
      evidence: {
        publicBuckets: publicBuckets.map((b) => b.value),
        danglingServices: danglingServices.slice(0, 10).map((s) => s.value),
      },
    });
  }

  return {
    moduleId: "shadow-detector",
    moduleName: "Shadow Asset Detector",
    assets,
    findings,
    success: true,
    durationMs: Date.now() - startTime,
  };
}
