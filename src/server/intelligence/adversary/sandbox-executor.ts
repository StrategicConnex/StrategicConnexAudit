/**
 * sandbox-executor.ts — Sandboxed Command Execution for Adversary Simulations (P3.5)
 *
 * Ejecuta los `executorCommand` del catálogo MITRE de forma AISLADA y SEGURA.
 *
 * PRINCIPIO DE SEGURIDAD:
 *   NUNCA se lanza un shell real (sin child_process, sin eval). Los comandos
 *   del catálogo se interpretan contra una ALLOWLIST de formas conocidas y se
 *   traducen a operaciones de red in-process que pasan por el egress-guard
 *   (bloqueo SSRF a rangos privados/reservados), con timeouts estrictos y
 *   parseo de output a hallazgos.
 *
 * Soportados por el sandbox:
 *   · http       → línea de request raw ("GET /path HTTP/1.1") → safeFetch
 *   · bash/curl  → GET http(s)://... → safeFetch
 *   · bash/nc    → "nc -zv <host> <port>" → TCP probe (socket con timeout)
 *   · bash/nmap  → "nmap -sT -p a,b,c <host>" → port scan (concurrencia acotada)
 *   · powershell → SOLO asesoría (requiere un host Windows objetivo; no se
 *                  ejecuta remotamente por razones de seguridad)
 *   · manual     → asesoría (acción manual del operador)
 *
 * Todo output se trunca (OUTPUT_MAX_CHARS) para acotar el payload en BD.
 */

import net from "node:net";
import { assertPublicHostname, safeFetch } from "../security/egress-guard";

export type SandboxExecutorType = "http" | "bash" | "powershell" | "manual";
export type SandboxFindingSeverity = "info" | "low" | "medium" | "high" | "critical";

export interface SandboxFinding {
  title: string;
  description: string;
  severity: SandboxFindingSeverity;
  evidence: Record<string, unknown>;
}

export interface SandboxExecutionInput {
  executorType: SandboxExecutorType;
  executorCommand: string;
  /** Host objetivo (dominio o IP del proyecto). Se usa para sustituir $TARGET. */
  target: string;
  timeoutMs?: number;
  /** Inyectable para tests deterministas (default: tcpProbe real). */
  probe?: (h: string, p: number, t: number) => Promise<{ open: boolean; error?: string }>;
}

export interface SandboxExecutionResult {
  /** true si se realizó una operación real (HTTP probe / TCP probe). */
  executed: boolean;
  status: "ok" | "blocked" | "unsupported" | "error" | "timeout";
  output: string;
  findings: SandboxFinding[];
  durationMs: number;
  detail?: string;
}

const PROBE_TIMEOUT_MS = 4_000;
const OUTPUT_MAX_CHARS = 12_000;
const MAX_SCAN_PORTS = 20;
const MAX_FINDINGS = 10;

// ─── Helpers puros (unit-testables) ──────────────────────────────────────────

/** Normaliza el target a un hostname desnudo (sin scheme, sin path, sin puerto). */
export function extractTargetHost(target: string): string | null {
  if (!target) return null;
  let t = target.trim().toLowerCase();
  t = t.replace(/^https?:\/\//i, "");
  t = t.replace(/\/.*$/, "");
  t = t.replace(/:.*$/, "");
  return t || null;
}

/**
 * Parsea una línea de request HTTP raw del catálogo:
 *   "GET /?id=1' OR 1=1-- HTTP/1.1"
 *   "POST /upload HTTP/1.1 Content-Type: multipart/form-data [shell.jsp]"
 */
export function parseHttpRequestLine(
  line: string
): { method: string; path: string; contentType?: string } | null {
  const trimmed = line.trim();
  const m = trimmed.match(/^([A-Za-z]+)\s+(.+?)\s+HTTP\/\d(?:\.\d)?(?:\s+(.*))?$/);
  if (!m) return null;

  const method = m[1]!.toUpperCase();
  let path = m[2]!.trim();
  if (!path.startsWith("/")) path = `/${path}`;
  // Defensa en profundidad: cap al path (comandos estáticos, pero un path
  // patológico no debe generar URLs/outputs ilimitados).
  if (path.length > 500) return null;

  const headers = m[3] || "";
  const contentType = headers.match(/content-type:\s*([^\s;]+)/i)?.[1];

  return { method, path, contentType };
}

export interface ParsedBashCommand {
  kind: "curl" | "nc" | "nmap";
  host: string;
  url?: string;
  port?: number;
  ports?: number[];
}

/**
 * Interpreta un comando bash del catálogo contra la allowlist.
 * Reemplaza $TARGET por el host real. Devuelve null si no es un patrón
 * soportado (nunca se ejecuta nada que no esté en la allowlist).
 */
export function parseBashCommand(command: string, target: string): ParsedBashCommand | null {
  const cmd = command.replace(/\$TARGET/gi, target);
  const host = extractTargetHost(target);
  if (!host) return null;

  if (/curl/i.test(cmd)) {
    const url = cmd.match(/https?:\/\/[^\s|"'`]+/i)?.[0];
    if (url) return { kind: "curl", host, url };
  }

  if (/^nc\s/i.test(cmd)) {
    const ncMatch = cmd.match(/nc\s+(?:-\S+\s+)*([^\s|"'`]+)\s+(\d+)/i);
    if (ncMatch) {
      const ncHost = ncMatch[1];
      const port = parseInt(ncMatch[2]!, 10);
      if (ncHost && !ncHost.includes("://") && port > 0 && port < 65536) {
        return { kind: "nc", host: ncHost, port };
      }
    }
  }

  if (/nmap/i.test(cmd)) {
    const nmapMatch = cmd.match(/nmap\s+.*?-p\s+([\d,\-]+)\s+([^\s|"'`]+)/i);
    if (nmapMatch) {
      const ports = expandPortList(nmapMatch[1]!);
      const nmapHost = nmapMatch[2];
      if (ports.length && nmapHost) {
        return { kind: "nmap", host: nmapHost, ports };
      }
    }
  }

  return null;
}

/** Expande "22,80,443,1-10" a un array de puertos únicos (acotado a MAX_SCAN_PORTS). */
export function expandPortList(spec: string): number[] {
  const out: number[] = [];
  for (const part of spec.split(",")) {
    const p = part.trim();
    if (!p) continue;
    if (p.includes("-")) {
      const [a, b] = p.split("-").map((x) => parseInt(x, 10));
      if (!a || !b || a <= 0 || b > 65535 || a > b) continue;
      for (let i = a; i <= b && out.length < MAX_SCAN_PORTS; i++) out.push(i);
    } else {
      const v = parseInt(p, 10);
      if (v > 0 && v < 65536) out.push(v);
    }
    if (out.length >= MAX_SCAN_PORTS) break;
  }
  return [...new Set(out)];
}

// ─── Operaciones de red (egress-guard obligatorio) ──────────────────────────

/** TCP probe con timeout estricto. Devuelve { open } sin lanzar excepciones. */
export async function tcpProbe(
  host: string,
  port: number,
  timeoutMs: number = PROBE_TIMEOUT_MS
): Promise<{ open: boolean; error?: string }> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const done = (result: { open: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done({ open: true }));
    socket.once("timeout", () => done({ open: false, error: "timeout" }));
    socket.once("error", (err: Error) => done({ open: false, error: err.message }));
    socket.connect(port, host);
  });
}

/**
 * Port scan con concurrencia acotada. El parámetro `probe` es inyectable
 * para tests deterministas (por defecto usa tcpProbe real).
 */
export async function scanPorts(
  host: string,
  ports: number[],
  timeoutMs: number = PROBE_TIMEOUT_MS,
  probe: (h: string, p: number, t: number) => Promise<{ open: boolean }> = tcpProbe
): Promise<Array<{ port: number; open: boolean }>> {
  const results: Array<{ port: number; open: boolean }> = [];
  const queue = [...ports];
  const maxConcurrent = Math.min(5, queue.length || 1);

  const worker = async () => {
    while (queue.length) {
      const port = queue.shift()!;
      const r = await probe(host, port, timeoutMs);
      results.push({ port, open: r.open });
    }
  };

  await Promise.all(Array.from({ length: maxConcurrent }, worker));
  return results.sort((a, b) => a.port - b.port);
}

// ─── Parseo de output a hallazgos ───────────────────────────────────────────

const PORT_SEVERITY: Record<number, SandboxFindingSeverity> = {
  21: "medium", 22: "medium", 23: "medium", 25: "info", 80: "info", 443: "info",
  445: "high", 3389: "high", 5432: "medium", 3306: "medium", 6379: "medium",
  5900: "medium", 8080: "medium", 8443: "medium", 9200: "medium",
};

const PORT_HINTS: Record<number, string> = {
  21: "FTP expuesto", 22: "SSH expuesto", 23: "Telnet expuesto (sin cifrado)",
  25: "SMTP", 80: "HTTP", 443: "HTTPS", 445: "SMB potencialmente expuesto",
  3389: "RDP expuesto (superficie de brute-force)", 5432: "PostgreSQL",
  3306: "MySQL", 6379: "Redis", 5900: "VNC", 8080: "HTTP alternativo",
  8443: "HTTPS alternativo", 9200: "Elasticsearch",
};

function httpFindings(
  method: string,
  path: string,
  status: number,
  url: string
): SandboxFinding[] {
  const sensitive = /(admin|login|signin|upload|console|panel|config|backup|\.env|\.git)/i.test(path);

  if (status >= 200 && status < 400) {
    const severity: SandboxFindingSeverity = sensitive ? "high" : "medium";
    return [{
      title: `${method} ${path} respondió ${status}${sensitive ? " (endpoint sensible expuesto)" : ""}`,
      description: `El endpoint respondió ${status} a un probe ${method}.` +
        (sensitive ? " Endpoint administrativo/sensible accesible desde internet." : ""),
      severity,
      evidence: { method, path, status, url },
    }];
  }

  if (status >= 500) {
    return [{
      title: `${method} ${path} respondió ${status} (error de servidor)`,
      description: "El servidor devolvió un 5xx al probe de simulación.",
      severity: "medium",
      evidence: { method, path, status, url },
    }];
  }

  return [{
    title: `${method} ${path} respondió ${status}`,
    description: "El endpoint rechazó el probe (4xx) — sin exposición evidente.",
    severity: "info",
    evidence: { method, path, status, url },
  }];
}

function portFindings(
  openPorts: Array<{ port: number }>,
  host: string
): SandboxFinding[] {
  return openPorts.map(({ port }) => ({
    title: `Puerto ${port} abierto en ${host}`,
    description: `El puerto ${port} acepta conexiones TCP. ${
      PORT_HINTS[port] ? `${PORT_HINTS[port]}.` : "Verificar si el servicio expuesto es intencional."
    }`,
    severity: PORT_SEVERITY[port] ?? "low",
    evidence: { host, port },
  }));
}

// ─── Ejecución principal ─────────────────────────────────────────────────────

function advisoryOutput(executorType: SandboxExecutorType, command: string): string {
  return [
    `[${executorType.toUpperCase()}] Comando NO ejecutado en el sandbox (seguridad).`,
    executorType === "powershell"
      ? "Este ejecutor requiere acción en un host Windows objetivo; no se ejecuta remotamente."
      : "Este ejecutor requiere acción manual del operador.",
    "",
    "Comando de referencia:",
    `  ${command}`,
  ].join("\n");
}

async function runHttpProbe(
  url: string,
  method: string,
  timeoutMs: number,
  contentType?: string
): Promise<{ status: number; headers: Record<string, string>; bodySnippet: string }> {
  const res = await safeFetch(url, {
    method,
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
    ...(contentType ? { headers: { "Content-Type": contentType } } : {}),
  });

  const headers: Record<string, string> = {};
  for (const [key, value] of res.headers.entries()) {
    if (["content-type", "server", "location", "x-powered-by"].includes(key.toLowerCase())) {
      headers[key.toLowerCase()] = value;
    }
  }

  const body = await res.text();
  return { status: res.status, headers, bodySnippet: body.slice(0, 300) };
}

async function runHttpCommand(
  command: string,
  host: string,
  timeoutMs: number
): Promise<Omit<SandboxExecutionResult, "durationMs">> {
  const parsed = parseHttpRequestLine(command);
  if (!parsed) {
    return {
      executed: false,
      status: "unsupported",
      output: `Request HTTP no reconocida por el sandbox: ${command}`,
      findings: [],
      detail: "parse",
    };
  }

  const probeUrl = `https://${host}${encodeURI(parsed.path)}`;
  const res = await runHttpProbe(probeUrl, parsed.method, timeoutMs, parsed.contentType);

  const lines = [
    `[HTTP ${parsed.method}] ${parsed.path}`,
    `→ ${res.status}`,
    ...Object.entries(res.headers).map(([k, v]) => `${k}: ${v}`),
    `[Body] ${res.bodySnippet}`,
  ];
  if (parsed.method === "POST") {
    lines.push("(payload omitido — simulación segura, sin subida de archivo)");
  }

  return {
    executed: true,
    status: "ok",
    output: lines.join("\n").slice(0, OUTPUT_MAX_CHARS),
    findings: httpFindings(parsed.method, parsed.path, res.status, probeUrl).slice(0, MAX_FINDINGS),
  };
}

async function runBashCommand(
  command: string,
  host: string,
  timeoutMs: number,
  probe: (h: string, p: number, t: number) => Promise<{ open: boolean; error?: string }> = tcpProbe
): Promise<Omit<SandboxExecutionResult, "durationMs">> {
  const parsed = parseBashCommand(command, host);
  if (!parsed) {
    return {
      executed: false,
      status: "unsupported",
      output: `Comando bash no soportado por el sandbox (allowlist: curl, nc -zv, nmap -sT):\n${command}`,
      findings: [],
      detail: "allowlist",
    };
  }

  if (parsed.kind === "curl" && parsed.url) {
    const targetUrl = parsed.url.replace(/\$TARGET/gi, host);
    const urlHost = new URL(targetUrl).hostname;
    // Defensa en profundidad: el host del URL también pasa por egress-guard,
    // aunque apunte a otro destino distinto del proyecto.
    await assertPublicHostname(urlHost);

    const res = await runHttpProbe(targetUrl, "GET", timeoutMs);
    const lines = [
      `[curl] GET ${targetUrl}`,
      `→ ${res.status}`,
      ...Object.entries(res.headers).map(([k, v]) => `${k}: ${v}`),
      `[Body] ${res.bodySnippet}`,
    ];

    return {
      executed: true,
      status: "ok",
      output: lines.join("\n").slice(0, OUTPUT_MAX_CHARS),
      findings: httpFindings("GET", new URL(targetUrl).pathname, res.status, targetUrl).slice(0, MAX_FINDINGS),
    };
  }

  if (parsed.kind === "nc" && parsed.port) {
    // Defensa en profundidad: el host del comando (no solo el target)
    // también pasa por egress-guard antes de abrir cualquier socket.
    await assertPublicHostname(parsed.host);
    const probeResult = await probe(parsed.host, parsed.port, PROBE_TIMEOUT_MS);
    const lines = [
      `[nc -zv] ${parsed.host}:${parsed.port}`,
      probeResult.open ? "→ open (accesible)" : `→ cerrado/filtrado (${probeResult.error || "sin respuesta"})`,
    ];

    return {
      executed: true,
      status: "ok",
      output: lines.join("\n").slice(0, OUTPUT_MAX_CHARS),
      findings: probeResult.open ? portFindings([{ port: parsed.port }], parsed.host).slice(0, MAX_FINDINGS) : [],
    };
  }

  if (parsed.kind === "nmap" && parsed.ports) {
    await assertPublicHostname(parsed.host);
    // El probe inyectable (tests) también aplica al port scan (consistencia
    // con el branch nc — override global del input).
    const results = await scanPorts(parsed.host, parsed.ports, PROBE_TIMEOUT_MS, probe);
    const open = results.filter((r) => r.open);
    const lines = [
      `[nmap -sT] ${parsed.host} (${parsed.ports.length} puertos)`,
      ...results.map((r) => `${r.port}/tcp ${r.open ? "open" : "closed"}`),
    ];

    return {
      executed: true,
      status: "ok",
      output: lines.join("\n").slice(0, OUTPUT_MAX_CHARS),
      findings: portFindings(open, parsed.host).slice(0, MAX_FINDINGS),
    };
  }

  return {
    executed: false,
    status: "unsupported",
    output: "Patrón bash no resuelto por el sandbox.",
    findings: [],
    detail: "parse",
  };
}

/**
 * Entry point del sandbox. Ejecuta el comando del catálogo contra el target
 * del proyecto, siempre pasando por egress-guard y con timeouts.
 */
export async function runSandboxedCommand(
  input: SandboxExecutionInput
): Promise<SandboxExecutionResult> {
  const started = Date.now();
  const { executorType, executorCommand, target, probe } = input;
  const timeoutMs = input.timeoutMs ?? 10_000;

  const finish = (
    partial: Omit<SandboxExecutionResult, "durationMs">
  ): SandboxExecutionResult => ({ ...partial, durationMs: Date.now() - started });

  const host = extractTargetHost(target);
  if (!host) {
    return finish({
      executed: false,
      status: "error",
      output: "Target inválido o vacío.",
      findings: [],
      detail: "target",
    });
  }

  if (executorType === "manual" || executorType === "powershell") {
    return finish({
      executed: false,
      status: "unsupported",
      output: advisoryOutput(executorType, executorCommand),
      findings: [],
      detail: `El ejecutor ${executorType} requiere acción en el host objetivo.`,
    });
  }

  // Barrera de seguridad: el target debe resolver a IPs públicas.
  try {
    await assertPublicHostname(host);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return finish({
      executed: false,
      status: "blocked",
      output: `EgressGuard: ${msg}`,
      findings: [],
      detail: msg,
    });
  }

  try {
    if (executorType === "http") {
      return finish(await runHttpCommand(executorCommand, host, timeoutMs));
    }
    if (executorType === "bash") {
      return finish(await runBashCommand(executorCommand, host, timeoutMs, probe));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const name = err instanceof Error ? err.name : "";
    const isTimeout = name === "TimeoutError" || name === "AbortError";
    // Host extraído del comando bloqueado por egress-guard (curl/nc/nmap):
    // NO hubo operación de red — se reporta como blocked/executed:false para
    // que el runner use el fallback simulado en vez de persistir un error.
    const isEgressBlock = /SSRF Prevention|EgressGuard|Acceso denegado/i.test(msg);
    if (isEgressBlock) {
      return finish({
        executed: false,
        status: "blocked",
        output: `EgressGuard: ${msg}`,
        findings: [],
        detail: msg,
      });
    }
    return finish({
      executed: true,
      status: isTimeout ? "timeout" : "error",
      output: `${isTimeout ? "Timeout" : "Error"} ejecutando: ${msg}`,
      findings: [],
      detail: msg,
    });
  }

  return finish({
    executed: false,
    status: "unsupported",
    output: `Ejecutor desconocido: ${executorType}`,
    findings: [],
    detail: "unknown",
  });
}
