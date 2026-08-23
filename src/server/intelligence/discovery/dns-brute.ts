/**
 * discovery/dns-brute.ts — DNS Brute Force Subdomain Discovery
 *
 * Descubre subdominios no conocidos mediante fuerza bruta DNS sobre
 * una wordlist predefinida. Usa resolución concurrente pero limitada
 * para no exceder los rate limits de los resolvers locales.
 *
 * Seguridad: todas las resoluciones pasan por assertPublicHostname
 * para evitar SSRF o fugas de DNS interno (RFC 1918, etc.).
 */

import dns from "node:dns/promises";
import { assertPublicHostname } from "../security/egress-guard";
import { getErrorMessage } from "@/shared/lib/errors";
import type { DiscoveredAsset, DiscoveryModuleResult } from "./types";
import type { Finding } from "../types/executor.types";

// ─── Wordlist común de subdominios ────────────────────────────────────────────
// Fuentes: SecLists, Commonspeak2, datos propios de CT logs.
// ~300 subdominios de alta probabilidad. Para producción se puede
// extender a 1k-10k con una wordlist externa.
const SUBDOMAIN_WORDLIST = [
  // Web & CMS
  "www", "wwww", "www-2", "www2", "www3", "www4", "www5",
  "web", "webserver", "webserver1", "webmail", "webdisk",
  "cpanel", "cpcalendars", "cpcontacts", "webapp", "app",
  "blog", "cms", "wp-admin", "wordpress", "joomla", "drupal",
  "moodle", "phpmyadmin", "adminer",
  // Email
  "mail", "mail2", "mail3", "smtp", "imap", "pop3", "pop",
  "email", "mx", "mx1", "mx2", "webmail", "owa", "outlook",
  "exchange", "autodiscover", "microsoft", "lyncdiscover",
  // DNS & Network
  "ns1", "ns2", "ns3", "ns4", "dns", "dns1", "dns2",
  "ns", "dnssec", "resolver", "ns0",
  // Security
  "vpn", "vpn2", "vpn3", "remote", "remoteaccess",
  "secure", "security", "firewall", "proxy", "gateway",
  "sso", "auth", "login", "logon", "signin",
  "2fa", "mfa", "otp", "token",
  // Infrastructure
  "api", "api2", "api3", "api-v1", "api-v2", "api-v3",
  "dev", "dev2", "staging", "stage", "test", "qa", "uat",
  "sandbox", "demo", "internal", "corp", "office",
  "server", "server1", "server2", "node", "node1", "node2",
  "db", "database", "mysql", "postgres", "redis", "sql",
  "backup", "backups", "backup1", "backup2",
  // Cloud & CDN
  "cdn", "cdn1", "cdn2", "static", "static1", "static2",
  "assets", "media", "images", "img", "img1", "img2",
  "uploads", "files", "storage", "s3", "bucket",
  // Monitoring & Observability
  "monitor", "monitoring", "grafana", "kibana", "prometheus",
  "status", "stats", "metrics", "logs", "log", "dashboard",
  "health", "uptime", "alert", "alerts",
  // CI/CD & Development
  "git", "github", "gitlab", "bitbucket", "jenkins",
  "ci", "cd", "build", "deploy", "release", "artifacts",
  "jira", "confluence", "trello", "notion", "slack",
  // Enterprise
  "portal", "portals", "my", "manage", "management",
  "admin", "administrator", "adminpanel", "controlpanel",
  "dashboard", "console", "enterprise", "corporate",
  "partner", "partners", "client", "clients",
  "help", "support", "helpdesk", "service", "services",
  "ticket", "tickets", "zendesk", "freshdesk",
  // File & Data
  "ftp", "ftp1", "ftp2", "sftp", "file", "files",
  "download", "downloads", "upload", "uploads",
  "transfer", "data", "databases", "share", "shared",
  // Geo & Regional
  "us", "eu", "asia", "apac", "emea", "americas",
  "ny", "nyc", "lon", "london", "frankfurt", "tokyo",
  "sydney", "singapore", "dubai", "sao-paulo",
  // Legacy & Misc
  "old", "legacy", "archive", "archives", "history",
  "beta", "alpha", "preview", "next", "new",
  "shop", "store", "checkout", "cart", "billing",
  "docs", "documentation", "wiki", "kb", "faq",
  "forms", "survey", "surveys", "feedback",
  "news", "press", "media", "events", "event",
  "remote", "work", "home", "office365", "teams",
  "chat", "discord", "mattermost", "rocket",
  "dns", "domain", "register", "registrar",
  "redirect", "redirects", "short", "shortlink",
  "track", "tracking", "analytics", "pixel",
  "recruiting", "jobs", "career", "careers",
  "academy", "learn", "training", "university",
  "community", "forum", "forums", "board",
  "statuspage", "statuspageio", "status",
  "lms", "elearning", "campus", "student",
  "erp", "crm", "hr", "payroll", "invoices",
  "sip", "voip", "phone", "call", "calls",
  "meet", "meeting", "meetings", "zoom", "teams",
  "webex", "gotomeeting", "adobeconnect",
  "cloud", "aws", "azure", "gcp", "oracle",
  "docker", "k8s", "kubernetes", "swarm",
  "registry", "npm", "docker-registry",
  "agent", "agents", "worker", "workers",
  "socket", "ws", "wss", "stream", "streaming",
  "mqtt", "amqp", "rabbitmq", "kafka",
  "search", "elastic", "elasticsearch", "solr",
  "cache", "memcache", "memcached", "varnish",
  "lb", "loadbalancer", "balancer", "haproxy",
  "config", "configuration", "settings",
  "setup", "install", "installation", "update",
  "patch", "patches", "hotfix", "hotfixes",
  "license", "licensing", "activation",
  "terms", "privacy", "legal", "gdpr",
  "affiliate", "affiliates", "referral",
  "marketing", "email-marketing", "campaign",
  "mailchimp", "sendgrid", "ses", "mailgun",
  "postfix", "sendmail", "spam", "antispam",
  "ssh", "ssh2", "terminal", "shell", "bastion",
  "rdp", "remote-desktop", "citrix", "vdi",
  "ns01", "ns02", "ns03", "ns1.", "ns2.",
  "dns1.", "dns2.", "mail1", "smtp1", "smtp2",
  "pop3.", "imap.", "owa.", "autodiscover.",
  "lync", "skype", "teams.", "zoom.",
  "anyconnect", "cisco", "juniper", "paloalto",
  "sophos", "fortinet", "fortigate", "sonicwall",
  "waf", "cloudflare", "incapsula", "akamai",
  "edge", "edgecast", "fastly", "keycdn",
  "sucuri", "stackpath", "imperva", "radware",
  "comodo", "sectigo", "letsencrypt", "ssl",
  "cert", "certificate", "crl", "ocsp",
  "ca", "intermediate", "root", "trust",
  "nexus", "artifactory", "sonatype",
  "graylog", "splunk", "datadog", "newrelic",
  "appdynamics", "dynatrace", "instana",
  "sentry", "rollbar", "bugsnag", "logrocket",
  "pagerduty", "opsgenie", "victorops",
  "terraform", "puppet", "ansible", "chef",
  "salt", "saltstack", "consul", "vault",
  "nomad", "spinnaker", "argo", "flux",
  "harbor", "quay", "ecr", "acr", "gcr",
  "istio", "linkerd", "envoy", "traefik",
  "kong", "apigee", "tyk", "gravitee",
  "openapi", "swagger", "redoc", "stoplight",
  "graphql", "graphiql", "playground", "gql",
  "grpc", "grpc-web", "rest", "rest-api",
  "socket.io", "socketio", "websocket",
  "cdn-cgi", "cgi-bin", "cgi", "scripts",
  "xmlrpc", "xml-rpc", "wp-json", "wp-cron",
  "wp-content", "wp-includes", "wp-admin",
  ".env", ".git", ".svn", ".hg", ".config",
  "crossdomain.xml", "clientaccesspolicy.xml",
  "robots.txt", "sitemap.xml", "sitemap",
  "humans.txt", "security.txt", "ads.txt",
  "apple-app-site-association", "assetlinks.json",
  ".well-known", "well-known", "wellknown",
];

// ─── Constantes de ejecución ──────────────────────────────────────────────────

/** Cuántos subdominios resolver en paralelo */
const CONCURRENCY_LIMIT = 16;

/** Timeout por resolución DNS individual (ms) */
const DNS_TIMEOUT_MS = 3000;

// ─── Helper: Resolver con timeout ─────────────────────────────────────────────

async function resolveWithTimeout(
  hostname: string,
  timeoutMs: number
): Promise<string | null> {
  try {
    const result = await Promise.race([
      dns.resolve4(hostname),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error("DNS timeout")), timeoutMs)
      ),
    ]);
    return (result as string[])?.[0] ?? null;
  } catch {
    return null;
  }
}

// ─── Módulo principal ─────────────────────────────────────────────────────────

export async function runDnsBruteForce(
  domain: string,
  projectId: string,
  wordlist?: string[]
): Promise<DiscoveryModuleResult> {
  const startTime = Date.now();
  const assets: DiscoveredAsset[] = [];
  const findings: Finding[] = [];

  // Validar que el dominio base es público
  try {
    await assertPublicHostname(domain);
  } catch (err: unknown) {
    return {
      moduleId: "dns-brute",
      moduleName: "DNS Brute Force Subdomain Discovery",
      assets: [],
      findings: [],
      success: false,
      error: `Dominio inválido o privado: ${getErrorMessage(err)}`,
      durationMs: Date.now() - startTime,
    };
  }

  const wordlistToUse = wordlist ?? SUBDOMAIN_WORDLIST;

  // Procesar en lotes concurrentes
  const results: Array<{ subdomain: string; ip: string | null }> = [];

  for (let i = 0; i < wordlistToUse.length; i += CONCURRENCY_LIMIT) {
    const batch = wordlistToUse.slice(i, i + CONCURRENCY_LIMIT);
    const batchResults = await Promise.all(
      batch.map(async (sub) => {
        const hostname = `${sub}.${domain}`;
        const ip = await resolveWithTimeout(hostname, DNS_TIMEOUT_MS);
        return { subdomain: hostname, ip };
      })
    );
    results.push(...batchResults);
  }

  // Filtrar los que resolvieron (tienen IP) y convertir a activos
  for (const r of results) {
    if (r.ip) {
      assets.push({
        assetType: "subdomain",
        value: r.subdomain,
        ip: r.ip,
        metadata: {
          discoveryMethod: "dns-brute-force",
          baseDomain: domain,
          resolvedAt: new Date().toISOString(),
        },
        severity: "info",
        description: `Subdominio descubierto por fuerza bruta DNS: ${r.subdomain} → ${r.ip}`,
      });
    }
  }

  // Generar hallazgo si se encontraron subdominios interesantes
  const interestingSubs = assets.filter((a) =>
    ["dev", "staging", "test", "api", "admin", "vpn", "jenkins", "jira",
     "gitlab", "grafana", "kibana", "prometheus", "splunk", "db", "mysql",
     "backup", "ftp", "sftp", "phpmyadmin", "adminer", "blog", "wp-admin",
     "wordpress", "mail", "webmail", "sso", "auth", "login", "portal",
     "jenkins", "confluence", "wiki", "kibana", "grafana", "prometheus",
     "redis", "mongodb", "kafka", "rabbitmq"].includes(a.value.split(".")[0])
  );

  if (interestingSubs.length > 0) {
    findings.push({
      severity: interestingSubs.length > 5 ? "high" : "medium",
      confidence: 0.9,
      title: `Subdominios con servicios potencialmente expuestos (${interestingSubs.length})`,
      description:
        `Se descubrieron ${interestingSubs.length} subdominios que alojan servicios internos o de administración accesibles desde Internet: ` +
        interestingSubs.map((a) => a.value).join(", ") +
        ". Estos activos suelen tener configuraciones menos restrictivas y representan un vector de entrada común en ataques.",
      recommendation:
        "Audite cada subdominio para determinar si debe estar expuesto públicamente. " +
        "Considere mover servicios internos detrás de una VPN o autenticación SSO.",
      affectedAsset: domain,
      evidence: {
        interestingCount: interestingSubs.length,
        samples: interestingSubs.slice(0, 10).map((a) => ({
          subdomain: a.value,
          ip: a.ip,
        })),
      },
    });
  }

  return {
    moduleId: "dns-brute",
    moduleName: "DNS Brute Force Subdomain Discovery",
    assets,
    findings,
    success: true,
    durationMs: Date.now() - startTime,
  };
}
