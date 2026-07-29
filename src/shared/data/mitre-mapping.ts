/**
 * shared/data/mitre-mapping.ts — MITRE ATT&CK Technique Mapping (Shared)
 *
 * Fuente única de verdad para el mapeo de herramientas de inteligencia
 * a técnicas MITRE ATT&CK. Tanto el servidor (src/server/intelligence/mitre/)
 * como el cliente (MitreBadge.tsx) importan desde aquí.
 *
 * MITRE ATT&CK Enterprise v15+: https://attack.mitre.org/
 */

export interface MitreTechnique {
  /** ID de la técnica (ej: T1583.001) */
  id: string;
  /** Nombre corto de la técnica */
  name: string;
  /** Táctica MITRE (Reconnaissance, Resource Development, etc.) */
  tactic: string;
  /** Descripción de cómo aplica al contexto de SCAUDIT */
  description: string;
  /** Enlace a la documentación de MITRE */
  url: string;
}

// ─── Mapeo de herramientas a técnicas MITRE ───────────────────────────────────

export const MITRE_MAPPING: Record<string, MitreTechnique[]> = {
  "dns.lookup": [
    { id: "T1580", name: "DNS Lookup", tactic: "Reconnaissance", description: "Resolución de registros DNS A, AAAA, MX, NS, TXT para mapear infraestructura.", url: "https://attack.mitre.org/techniques/T1580/" },
  ],
  "dns.mx": [
    { id: "T1580", name: "DNS Lookup / MX", tactic: "Reconnaissance", description: "Resolución de registros MX para identificar servidores de correo.", url: "https://attack.mitre.org/techniques/T1580/" },
  ],
  "dns.txt": [
    { id: "T1580", name: "DNS Lookup / TXT", tactic: "Reconnaissance", description: "Análisis de registros TXT incluyendo SPF y verificaciones de dominio.", url: "https://attack.mitre.org/techniques/T1580/" },
  ],
  "dns.ns": [
    { id: "T1580", name: "DNS Lookup / NS", tactic: "Reconnaissance", description: "Identificación de servidores DNS autoritativos.", url: "https://attack.mitre.org/techniques/T1580/" },
  ],
  "dns.dnssec": [
    { id: "T1580", name: "DNS Lookup / DNSSEC", tactic: "Reconnaissance", description: "Validación de cadena de confianza DNSSEC.", url: "https://attack.mitre.org/techniques/T1580/" },
  ],
  "dns.propagation": [
    { id: "T1580", name: "DNS Lookup / Propagation", tactic: "Reconnaissance", description: "Comparación de respuestas DNS entre múltiples resolutores.", url: "https://attack.mitre.org/techniques/T1580/" },
  ],
  "dns.zone": [
    { id: "T1595", name: "Active Scanning / Zone Transfer", tactic: "Reconnaissance", description: "Análisis de zona DNS para descubrir superficie de ataque.", url: "https://attack.mitre.org/techniques/T1595/" },
  ],
  "email.spf": [
    { id: "T1589.002", name: "Email Discovery / SPF", tactic: "Reconnaissance", description: "Análisis de política SPF para detectar configuraciones débiles.", url: "https://attack.mitre.org/techniques/T1589/002/" },
  ],
  "email.dkim": [
    { id: "T1589.002", name: "Email Discovery / DKIM", tactic: "Reconnaissance", description: "Validación de firmas DKIM y detección de claves débiles.", url: "https://attack.mitre.org/techniques/T1589/002/" },
  ],
  "email.dmarc": [
    { id: "T1589.002", name: "Email Discovery / DMARC", tactic: "Reconnaissance", description: "Evaluación de política DMARC para protección contra phishing.", url: "https://attack.mitre.org/techniques/T1589/002/" },
  ],
  "email.mail_health": [
    { id: "T1589.002", name: "Email Discovery / Composite", tactic: "Reconnaissance", description: "Evaluación compuesta de salud de correo.", url: "https://attack.mitre.org/techniques/T1589/002/" },
  ],
  "email.smtp": [
    { id: "T1047", name: "SMTP Service Scanning", tactic: "Reconnaissance", description: "Handshake SMTP para detectar relay abierto y configuraciones inseguras.", url: "https://attack.mitre.org/techniques/T1047/" },
  ],
  "email.blacklists": [
    { id: "T1583.001", name: "Domains / Reputation", tactic: "Resource Development", description: "Verificación en listas DNSBL para reputación de infraestructura.", url: "https://attack.mitre.org/techniques/T1583/001/" },
  ],
  "email.bimi": [
    { id: "T1589.002", name: "Email Discovery / BIMI", tactic: "Reconnaissance", description: "Análisis de BIMI y validación VMC.", url: "https://attack.mitre.org/techniques/T1589/002/" },
  ],
  "email.score": [
    { id: "T1589.002", name: "Email Discovery / Score", tactic: "Reconnaissance", description: "Puntuación compuesta de seguridad de correo.", url: "https://attack.mitre.org/techniques/T1589/002/" },
  ],
  "email.server_reputation": [
    { id: "T1583.001", name: "Domains / Mail Reputation", tactic: "Resource Development", description: "Evaluación de reputación de servidores MX.", url: "https://attack.mitre.org/techniques/T1583/001/" },
  ],
  "network.ping": [
    { id: "T1595", name: "Active Scanning / Ping", tactic: "Reconnaissance", description: "Verificación de alcance y latencia mediante handshake TCP/HTTP.", url: "https://attack.mitre.org/techniques/T1595/" },
  ],
  "network.traceroute": [
    { id: "T1595.001", name: "Active Scanning / Traceroute", tactic: "Reconnaissance", description: "Traza de ruta de red para mapear topología y geolocalización.", url: "https://attack.mitre.org/techniques/T1595/001/" },
  ],
  "network.asn": [
    { id: "T1596.002", name: "Search Open Domains / ASN", tactic: "Reconnaissance", description: "Resolución de ASN y metadatos de red.", url: "https://attack.mitre.org/techniques/T1596/002/" },
  ],
  "network.geoip": [
    { id: "T1596.004", name: "Search Open Domains / Geolocation", tactic: "Reconnaissance", description: "Geolocalización de IPs para determinar ubicación física.", url: "https://attack.mitre.org/techniques/T1596/004/" },
  ],
  "network.reverse_dns": [
    { id: "T1589", name: "Gather Victim Identity / PTR", tactic: "Reconnaissance", description: "Resolución inversa DNS para descubrir hostnames.", url: "https://attack.mitre.org/techniques/T1589/" },
  ],
  "network.cdn": [
    { id: "T1596.005", name: "Search Open Domains / CDN", tactic: "Reconnaissance", description: "Detección pasiva de proveedores CDN.", url: "https://attack.mitre.org/techniques/T1596/005/" },
  ],
  "network.waf": [
    { id: "T1596.005", name: "Search Open Domains / WAF", tactic: "Reconnaissance", description: "Detección pasiva de Web Application Firewalls.", url: "https://attack.mitre.org/techniques/T1596/005/" },
  ],
  "network.reverse_ip": [
    { id: "T1589", name: "Gather Victim Identity / Reverse IP", tactic: "Reconnaissance", description: "Descubrimiento de dominios co-alojados.", url: "https://attack.mitre.org/techniques/T1589/" },
  ],
  "network.port_scan": [
    { id: "T1046", name: "Network Service Discovery", tactic: "Discovery", description: "Escaneo de puertos para detectar servicios expuestos.", url: "https://attack.mitre.org/techniques/T1046/" },
  ],
  "network.bgp": [
    { id: "T1596.002", name: "Search Open Domains / BGP", tactic: "Reconnaissance", description: "Análisis de rutas BGP y validación RPKI.", url: "https://attack.mitre.org/techniques/T1596/002/" },
  ],
  "tls.scan": [
    { id: "T1573.002", name: "Encrypted Channel / TLS", tactic: "Command and Control", description: "Inspección de certificados SSL/TLS, ciphers y vulnerabilidades.", url: "https://attack.mitre.org/techniques/T1573/002/" },
  ],
  "website.headers": [
    { id: "T1592.002", name: "Gather Host Info / Headers", tactic: "Reconnaissance", description: "Captura de cabeceras HTTP para fingerprint.", url: "https://attack.mitre.org/techniques/T1592/002/" },
  ],
  "website.security_headers": [
    { id: "T1592.002", name: "Gather Host Info / Security Headers", tactic: "Reconnaissance", description: "Evaluación de cabeceras de seguridad HTTP.", url: "https://attack.mitre.org/techniques/T1592/002/" },
  ],
  "website.tech_stack": [
    { id: "T1592.002", name: "Gather Host Info / Tech Fingerprinting", tactic: "Reconnaissance", description: "Fingerprinting pasivo de tecnologías web.", url: "https://attack.mitre.org/techniques/T1592/002/" },
  ],
  "website.redirects": [
    { id: "T1567", name: "Exfiltration Over Web / Redirects", tactic: "Collection", description: "Análisis de cadenas de redirección HTTP.", url: "https://attack.mitre.org/techniques/T1567/" },
  ],
  "website.cookies": [
    { id: "T1592.002", name: "Gather Host Info / Cookies", tactic: "Reconnaissance", description: "Análisis de flags de cookies de seguridad.", url: "https://attack.mitre.org/techniques/T1592/002/" },
  ],
  "website.csp": [
    { id: "T1592.002", name: "Gather Host Info / CSP", tactic: "Reconnaissance", description: "Análisis profundo de Content-Security-Policy.", url: "https://attack.mitre.org/techniques/T1592/002/" },
  ],
  "website.performance": [
    { id: "T1592.002", name: "Gather Host Info / Performance", tactic: "Reconnaissance", description: "Métricas de rendimiento de sitio web.", url: "https://attack.mitre.org/techniques/T1592/002/" },
  ],
  "website.fingerprint": [
    { id: "T1592.002", name: "Gather Host Info / App Fingerprint", tactic: "Reconnaissance", description: "Fingerprint pasivo de aplicación web.", url: "https://attack.mitre.org/techniques/T1592/002/" },
  ],
  "website.robots": [
    { id: "T1592.002", name: "Gather Host Info / Robots.txt", tactic: "Reconnaissance", description: "Análisis de robots.txt para descubrir rutas sensibles.", url: "https://attack.mitre.org/techniques/T1592/002/" },
  ],
  "osint.whois": [
    { id: "T1596.001", name: "Search Open Domains / WHOIS", tactic: "Reconnaissance", description: "Consulta WHOIS/RDAP para metadatos de registro.", url: "https://attack.mitre.org/techniques/T1596/001/" },
  ],
  "threat.ip_reputation": [
    { id: "T1596.003", name: "Search Open Domains / Reputation Feeds", tactic: "Reconnaissance", description: "Cruce de IPs contra feeds de reputación.", url: "https://attack.mitre.org/techniques/T1596/003/" },
  ],
  "threat.custom_intel": [
    { id: "T1596.003", name: "Search Open Domains / Custom Intel", tactic: "Reconnaissance", description: "Cruce de dominios contra feeds de inteligencia de amenazas.", url: "https://attack.mitre.org/techniques/T1596/003/" },
  ],
  "dns-brute": [
    { id: "T1583.001", name: "Domains / Subdomain Discovery", tactic: "Resource Development", description: "Descubrimiento de subdominios mediante fuerza bruta DNS.", url: "https://attack.mitre.org/techniques/T1583/001/" },
  ],
  "ct-monitor": [
    { id: "T1596.001", name: "Search Open Domains / CT Logs", tactic: "Reconnaissance", description: "Monitoreo de Certificate Transparency para descubrir certificados.", url: "https://attack.mitre.org/techniques/T1596/001/" },
  ],
  "shadow-detector": [
    { id: "T1583.001", name: "Domains / Shadow IT", tactic: "Resource Development", description: "Detección de activos no autorizados (buckets expuestos, servicios huérfanos).", url: "https://attack.mitre.org/techniques/T1583/001/" },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Obtiene las técnicas MITRE asociadas a una herramienta/tool ID */
export function getMitreTechniques(toolId: string): MitreTechnique[] {
  return MITRE_MAPPING[toolId] || [];
}

/** Obtiene la primera técnica MITRE asociada a un tool ID */
export function getPrimaryMitreTechnique(toolId: string): MitreTechnique | null {
  const techniques = getMitreTechniques(toolId);
  return techniques.length > 0 ? techniques[0] : null;
}

/** Detecta técnica MITRE por contenido del título del hallazgo (keyword matching) */
export function detectTechniqueByTitle(title: string): MitreTechnique | null {
  const lower = title.toLowerCase();
  const rules: Array<{ keywords: string[]; technique: MitreTechnique }> = [
    { keywords: ['dns', 'registro a', 'nameserver'], technique: { id: 'T1580', name: 'DNS Lookup', tactic: 'Reconnaissance', description: 'Resolución DNS.', url: 'https://attack.mitre.org/techniques/T1580/' } },
    { keywords: ['spf', 'sender policy'], technique: { id: 'T1589.002', name: 'SPF', tactic: 'Reconnaissance', description: 'Análisis SPF.', url: 'https://attack.mitre.org/techniques/T1589/002/' } },
    { keywords: ['dkim'], technique: { id: 'T1589.002', name: 'DKIM', tactic: 'Reconnaissance', description: 'Validación DKIM.', url: 'https://attack.mitre.org/techniques/T1589/002/' } },
    { keywords: ['dmarc'], technique: { id: 'T1589.002', name: 'DMARC', tactic: 'Reconnaissance', description: 'Política DMARC.', url: 'https://attack.mitre.org/techniques/T1589/002/' } },
    { keywords: ['ssl', 'tls', 'certificado'], technique: { id: 'T1573.002', name: 'TLS', tactic: 'Command and Control', description: 'Inspección TLS.', url: 'https://attack.mitre.org/techniques/T1573/002/' } },
    { keywords: ['ping', 'latencia'], technique: { id: 'T1595', name: 'Active Scanning', tactic: 'Reconnaissance', description: 'Verificación.', url: 'https://attack.mitre.org/techniques/T1595/' } },
    { keywords: ['asn', 'sistema autonomo'], technique: { id: 'T1596.002', name: 'ASN', tactic: 'Reconnaissance', description: 'Resolución ASN.', url: 'https://attack.mitre.org/techniques/T1596/002/' } },
    { keywords: ['geoip', 'geolocalizacion'], technique: { id: 'T1596.004', name: 'Geolocation', tactic: 'Reconnaissance', description: 'Geolocalización.', url: 'https://attack.mitre.org/techniques/T1596/004/' } },
    { keywords: ['whois', 'rdap', 'registrar', 'expira'], technique: { id: 'T1596.001', name: 'WHOIS', tactic: 'Reconnaissance', description: 'Consulta WHOIS.', url: 'https://attack.mitre.org/techniques/T1596/001/' } },
    { keywords: ['reputacion', 'blacklist', 'spamhaus'], technique: { id: 'T1596.003', name: 'Reputation', tactic: 'Reconnaissance', description: 'Feeds reputación.', url: 'https://attack.mitre.org/techniques/T1596/003/' } },
    { keywords: ['subdominio', 'subdomain'], technique: { id: 'T1583.001', name: 'Subdomain Discovery', tactic: 'Resource Development', description: 'Descubrimiento subdominios.', url: 'https://attack.mitre.org/techniques/T1583/001/' } },
    { keywords: ['shadow', 'bucket'], technique: { id: 'T1583.001', name: 'Shadow IT', tactic: 'Resource Development', description: 'Shadow IT detection.', url: 'https://attack.mitre.org/techniques/T1583/001/' } },
    { keywords: ['certificate transparency', 'ct log'], technique: { id: 'T1596.001', name: 'CT Logs', tactic: 'Reconnaissance', description: 'CT logs monitoring.', url: 'https://attack.mitre.org/techniques/T1596/001/' } },
    { keywords: ['correo', 'mx', 'mail exchange'], technique: { id: 'T1589.002', name: 'Email Discovery', tactic: 'Reconnaissance', description: 'Infraestructura de correo.', url: 'https://attack.mitre.org/techniques/T1589/002/' } },
    { keywords: ['cabecera', 'header', 'fingerprint'], technique: { id: 'T1592.002', name: 'Server Headers', tactic: 'Reconnaissance', description: 'Fingerprinting.', url: 'https://attack.mitre.org/techniques/T1592/002/' } },
    { keywords: ['hsts', 'csp', 'x-frame-options'], technique: { id: 'T1592.002', name: 'Security Headers', tactic: 'Reconnaissance', description: 'Cabeceras de seguridad.', url: 'https://attack.mitre.org/techniques/T1592/002/' } },
    { keywords: ['redirect', 'open redirect'], technique: { id: 'T1567', name: 'Redirect Analysis', tactic: 'Collection', description: 'Análisis de redirecciones.', url: 'https://attack.mitre.org/techniques/T1567/' } },
    { keywords: ['cookie', 'sesion'], technique: { id: 'T1592.002', name: 'Cookie Flags', tactic: 'Reconnaissance', description: 'Análisis de cookies.', url: 'https://attack.mitre.org/techniques/T1592/002/' } },
    { keywords: ['robots.txt', 'disallow'], technique: { id: 'T1592.002', name: 'Robots.txt', tactic: 'Reconnaissance', description: 'Análisis robots.txt.', url: 'https://attack.mitre.org/techniques/T1592/002/' } },
    { keywords: ['puerto', 'port scan', 'abierto'], technique: { id: 'T1046', name: 'Port Scan', tactic: 'Discovery', description: 'Escaneo de puertos.', url: 'https://attack.mitre.org/techniques/T1046/' } },
    { keywords: ['bgp', 'rpki', 'enrutamiento'], technique: { id: 'T1596.002', name: 'BGP', tactic: 'Reconnaissance', description: 'Análisis BGP.', url: 'https://attack.mitre.org/techniques/T1596/002/' } },
    { keywords: ['traceroute', 'hops', 'rtt'], technique: { id: 'T1595.001', name: 'Traceroute', tactic: 'Reconnaissance', description: 'Traza de red.', url: 'https://attack.mitre.org/techniques/T1595/001/' } },
    { keywords: ['tecnologia', 'stack', 'cms', 'wordpress'], technique: { id: 'T1592.002', name: 'Tech Stack', tactic: 'Reconnaissance', description: 'Tecnologías web.', url: 'https://attack.mitre.org/techniques/T1592/002/' } },
  ];

  for (const rule of rules) {
    if (rule.keywords.some((kw) => lower.includes(kw))) return rule.technique;
  }
  return null;
}

/** Encuentra técnica MITRE por toolId + fallback a keyword matching por título */
export function findTechnique(toolId?: string, title?: string): MitreTechnique | null {
  if (toolId) {
    const fromTool = getPrimaryMitreTechnique(toolId);
    if (fromTool) return fromTool;
  }
  if (title) return detectTechniqueByTitle(title);
  return null;
}
