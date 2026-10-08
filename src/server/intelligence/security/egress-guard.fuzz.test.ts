import { describe, it, expect, vi, afterEach } from "vitest";
import net from "node:net";
import {
  isBlockedAddress,
  assertPublicHostname,
  safeFetch,
} from "./egress-guard";

/* ══════════════════════════════════════════════════════════════════
   D1 — Fuzz / property tests del egress-guard (SSRF)

   Objetivo: endurecer el componente de seguridad más crítico del
   engine de escaneo (fan-in 27). En vez de listas de casos puntuales,
   se comparan las respuestas del guard contra un ORACLE independiente
   (BigInt) sobre miles de direcciones generadas con un PRNG sembrado
   — determinista y sin dependencias nuevas (no fast-check).

   Qué cubre:
     · CIDR IPv4 (16 rangos) e IPv6 (7 prefijos): límites inclusivos.
     · Vecinos fuera de rango que NO deben bloquearse.
     · IPv4-mapped IPv6 (::ffff:) — forma punteada y hexadecimal.
     · Fuzz aleatorio guard-vs-oracle (v4 y v6, incl. mapped).
     · Entradas malformadas: nunca lanza, siempre boolean, y las
       familias no reconocidas se bloquean (fail-closed).
     · Redirecciones: revalidación de Location con IPs fuzzeadas.
   ══════════════════════════════════════════════════════════════════ */

// ─── Lista CIDR espejo de la especificación del módulo ─────────────
// (mantener sincronizada con PRIVATE_V4_PREFIXES / PRIVATE_V6_PREFIXES)
const V4_CIDRS = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.88.99.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/22",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
  "255.255.255.255/32",
];

const V6_CIDRS = [
  "::/128",
  "::1/128",
  "100::/64",
  "2001:db8::/32",
  "fc00::/7",
  "fe80::/10",
  "ff00::/8",
];

// ─── PRNG sembrado (mulberry32) — reproducible en CI ───────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(0x5ca0d17); // semilla fija
const rand32 = () => Math.floor(rand() * 0x100000000) >>> 0;
const rand16 = () => Math.floor(rand() * 0x10000);

// ─── Conversiones / formato ────────────────────────────────────────
const MASK32 = 0xffffffffn;

function ipv4ToU32(ip: string): bigint {
  const [a, b, c, d] = ip.split(".").map((x) => BigInt(parseInt(x, 10)));
  return ((a! << 24n) | (b! << 16n) | (c! << 8n) | d!) & MASK32;
}

function u32ToIpv4(n: bigint): string {
  const x = Number(n & MASK32);
  return [(x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255].join(".");
}

function ipv6ToBigInt(ip: string): bigint {
  const [head, tail] = ip.split("::");
  const h = head ? head.split(":") : [];
  let groups: string[];
  if (tail === undefined) {
    groups = h;
  } else {
    const t = tail ? tail.split(":") : [];
    groups = [...h, ...Array(8 - (h.length + t.length)).fill("0"), ...t];
  }
  let v = 0n;
  for (const g of groups) {
    if (g.includes(".")) {
      // Cuádruple punteado embebido (::ffff:a.b.c.d) → dos hextets.
      const [a, b, c, d] = g.split(".").map((x) => parseInt(x, 10));
      v = (v << 16n) | BigInt(((a! << 8) | b!) & 0xffff);
      v = (v << 16n) | BigInt(((c! << 8) | d!) & 0xffff);
    } else {
      v = (v << 16n) | BigInt(parseInt(g || "0", 16));
    }
  }
  return v;
}

function bigIntToIpv6(v: bigint): string {
  const groups: string[] = [];
  for (let i = 7; i >= 0; i--) {
    groups.push((((v >> BigInt(i * 16)) & 0xffffn) as bigint).toString(16).padStart(4, "0"));
  }
  return groups.join(":");
}

// ─── ORACLE independiente (BigInt, sin reusar la lógica del módulo) ─
function cidr4Range(cidr: string): [bigint, bigint] {
  const [base, prefixStr] = cidr.split("/");
  const prefix = BigInt(prefixStr!);
  const hostBits = 32n - prefix;
  const start = ipv4ToU32(base!) & (hostBits === 0n ? MASK32 : (MASK32 << hostBits) & MASK32);
  const end = start | (hostBits === 0n ? 0n : (1n << hostBits) - 1n);
  return [start, end];
}

function cidr6Range(cidr: string): [bigint, bigint] {
  const [base, prefixStr] = cidr.split("/");
  const prefix = BigInt(prefixStr!);
  const hostBits = 128n - prefix;
  const allOnes = (1n << 128n) - 1n;
  const start = ipv6ToBigInt(base!) & (hostBits === 0n ? allOnes : (allOnes << hostBits) & allOnes);
  const end = start | (hostBits === 0n ? 0n : (1n << hostBits) - 1n);
  return [start, end];
}

const V4_RANGES = V4_CIDRS.map(cidr4Range);
const V6_RANGES = V6_CIDRS.map(cidr6Range);
const inRange = (ranges: [bigint, bigint][], n: bigint) =>
  ranges.some(([s, e]) => n >= s && n <= e);

/** Respuesta esperada según la especificación RFC del guard. */
function oracleBlocked(ip: string): boolean {
  if (net.isIPv4(ip)) return inRange(V4_RANGES, ipv4ToU32(ip));
  if (net.isIPv6(ip)) {
    const v = ipv6ToBigInt(ip);
    // IPv4-mapped: 80 bits en 0 + 16 bits 0xffff → se coteja como IPv4.
    if (v >> 32n === 0xffffn) return inRange(V4_RANGES, v & MASK32);
    return inRange(V6_RANGES, v);
  }
  return true; // familia no reconocida → fail-closed
}

// ─── Generadores de entradas ───────────────────────────────────────
function randomIpv4(): string {
  return u32ToIpv4(BigInt(rand32()));
}

function randomIpv6(): string {
  let v = 0n;
  for (let i = 0; i < 8; i++) v = (v << 16n) | BigInt(rand16());
  return bigIntToIpv6(v);
}

function randomMappedDotted(): string {
  return `::ffff:${randomIpv4()}`;
}

function randomMappedFull(): string {
  const hi = rand16().toString(16).padStart(4, "0");
  const lo = rand16().toString(16).padStart(4, "0");
  return `0000:0000:0000:0000:0000:ffff:${hi}:${lo}`;
}

/** IP justo en el borde de un rango v4 (sesga el fuzz hacia los límites). */
function boundaryBiasIpv4(): string {
  const [s, e] = V4_RANGES[Math.floor(rand() * V4_RANGES.length)]!;
  const span = Number(e - s);
  const pick = [0, span, -1, span + 1, 1, span - 1][Math.floor(rand() * 6)]!;
  let n = s + BigInt(pick);
  if (n < 0n) n = 0n;
  if (n > MASK32) n = MASK32;
  return u32ToIpv4(n);
}

const GARBAGE_CHARS = "0123456789abcdef:.xX-_ /%\t";

function randomGarbage(): string {
  const len = 1 + Math.floor(rand() * 24);
  let s = "";
  for (let i = 0; i < len; i++) s += GARBAGE_CHARS[Math.floor(rand() * GARBAGE_CHARS.length)];
  return s;
}

/* ══════════════════════════════════════════════════════════════════ */

describe("egress-guard.fuzz — D1 (SSRF property tests)", () => {
  describe("CIDR v4 — límites inclusivos", () => {
    for (const cidr of V4_CIDRS) {
      it(`bloquea primero y último de ${cidr}`, () => {
        const [s, e] = cidr4Range(cidr);
        expect(isBlockedAddress(u32ToIpv4(s))).toBe(true);
        expect(isBlockedAddress(u32ToIpv4(e))).toBe(true);
        expect(oracleBlocked(u32ToIpv4(s))).toBe(true);
        expect(oracleBlocked(u32ToIpv4(e))).toBe(true);
      });
    }
  });

  describe("CIDR v6 — límites inclusivos", () => {
    for (const cidr of V6_CIDRS) {
      it(`bloquea primero y último de ${cidr}`, () => {
        const [s, e] = cidr6Range(cidr);
        expect(isBlockedAddress(bigIntToIpv6(s))).toBe(true);
        expect(isBlockedAddress(bigIntToIpv6(e))).toBe(true);
      });
    }
  });

  describe("vecinos fuera de rango NO se bloquean", () => {
    const justOutside: Array<[string, string[]]> = [
      ["10.0.0.0/8", ["9.255.255.255", "11.0.0.0"]],
      ["172.16.0.0/12", ["172.15.255.255", "172.32.0.0"]],
      ["192.168.0.0/16", ["192.167.255.255", "192.169.0.0"]],
      ["127.0.0.0/8", ["126.255.255.255", "128.0.0.0"]],
      ["100.64.0.0/10", ["100.63.255.255", "100.128.0.0"]],
      ["169.254.0.0/16", ["169.253.255.255", "169.255.0.0"]],
      ["198.18.0.0/15", ["198.17.255.255", "198.20.0.0"]],
      ["192.0.2.0/24", ["192.0.1.255", "192.0.3.0"]],
      ["198.51.100.0/22", ["198.51.99.255", "198.51.104.0"]],
      ["203.0.113.0/24", ["203.0.112.255", "203.0.114.0"]],
      ["224.0.0.0/4", ["223.255.255.255"]],
    ];

    for (const [cidr, neighbours] of justOutside) {
      it(`vecinos de ${cidr} son públicos`, () => {
        for (const ip of neighbours) {
          expect(isBlockedAddress(ip), ip).toBe(false);
          expect(oracleBlocked(ip), ip).toBe(false);
        }
      });
    }
  });

  describe("IPv4-mapped IPv6 (::ffff:) — equivalencia", () => {
    it("forma punteada y hexadecimal coinciden con la IPv4 embebida", () => {
      for (let i = 0; i < 2000; i++) {
        const v4 = randomIpv4();
        const hi = (Number(ipv4ToU32(v4) >> 16n) & 0xffff).toString(16).padStart(4, "0");
        const lo = (Number(ipv4ToU32(v4) & 0xffffn) & 0xffff).toString(16).padStart(4, "0");
        const expected = isBlockedAddress(v4);
        expect(isBlockedAddress(`::ffff:${v4}`), `::ffff:${v4}`).toBe(expected);
        expect(
          isBlockedAddress(`0000:0000:0000:0000:0000:ffff:${hi}:${lo}`),
          `hex ${v4}`
        ).toBe(expected);
      }
    });

    it("direcciones IPv4-mapped privadas conocidas se bloquean", () => {
      for (const ip of [
        "::ffff:127.0.0.1",
        "::ffff:10.0.0.1",
        "::ffff:192.168.1.1",
        "::ffff:169.254.169.254",
        "::ffff:7f00:1",
        "0:0:0:0:0:ffff:0a00:0001",
        "::FFFF:AC10:0001",
      ]) {
        expect(isBlockedAddress(ip), ip).toBe(true);
      }
    });
  });

  describe("fuzz guard vs oracle (sembrado)", () => {
    it("IPv4 aleatorias + de borde: guard === oracle", () => {
      let blocked = 0;
      for (let i = 0; i < 4000; i++) {
        const ip = i % 2 === 0 ? randomIpv4() : boundaryBiasIpv4();
        expect(isBlockedAddress(ip), ip).toBe(oracleBlocked(ip));
        if (oracleBlocked(ip)) blocked++;
      }
      // Sanity: el muestreo debe tocar ambos lados de la decisión.
      expect(blocked).toBeGreaterThan(0);
      expect(blocked).toBeLessThan(4000);
    });

    it("IPv6 aleatorias (incl. mapped): guard === oracle", () => {
      for (let i = 0; i < 3000; i++) {
        const ip = i % 3 === 0 ? randomMappedDotted() : i % 3 === 1 ? randomMappedFull() : randomIpv6();
        expect(isBlockedAddress(ip), ip).toBe(oracleBlocked(ip));
      }
    });

    it("entradas malformadas: nunca lanza y las familias raras se bloquean", () => {
      for (let i = 0; i < 3000; i++) {
        const s = randomGarbage();
        let result: boolean | undefined;
        expect(() => {
          result = isBlockedAddress(s);
        }, JSON.stringify(s)).not.toThrow();
        expect(typeof result, JSON.stringify(s)).toBe("boolean");
        expect(result, JSON.stringify(s)).toBe(oracleBlocked(s));
      }
    });
  });

  describe("assertPublicHostname — IPs crudas fuzzeadas (sin DNS)", () => {
    it("rechaza toda IP bloqueada por el oracle", async () => {
      let checked = 0;
      for (let i = 0; i < 400; i++) {
        const ip = i % 2 === 0 ? randomIpv4() : boundaryBiasIpv4();
        if (!oracleBlocked(ip)) continue;
        await expect(assertPublicHostname(ip), ip).rejects.toThrow(/SSRF Prevention/);
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    });

    it("acepta IPs públicas crudas", async () => {
      let checked = 0;
      for (let i = 0; i < 400; i++) {
        const ip = randomIpv4();
        if (oracleBlocked(ip)) continue;
        const res = await assertPublicHostname(ip);
        expect(res[0]!.address).toBe(ip);
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    });
  });

  describe("safeFetch — revalidación de redirects fuzzeada", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("bloquea Location hacia IP privada aleatoria", async () => {
      let checked = 0;
      for (let i = 0; i < 60; i++) {
        const ip = boundaryBiasIpv4();
        if (!oracleBlocked(ip)) continue;
        const fetchMock = vi.fn(async () =>
          new Response(null, { status: 302, headers: { location: `http://${ip}/admin` } })
        );
        vi.stubGlobal("fetch", fetchMock);
        await expect(
          safeFetch("http://93.184.216.0/inicio", { redirect: "manual" }),
          ip
        ).rejects.toThrow(/SSRF Prevention|Acceso denegado/);
        vi.unstubAllGlobals();
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    });

    it("acepta Location hacia IP pública sin lanzar SSRF", async () => {
      let checked = 0;
      for (let i = 0; i < 200; i++) {
        const ip = randomIpv4();
        if (oracleBlocked(ip)) continue;
        const fetchMock = vi.fn(async () =>
          new Response(null, { status: 302, headers: { location: `http://${ip}/ok` } })
        );
        vi.stubGlobal("fetch", fetchMock);
        const res = await safeFetch("http://93.184.216.0/inicio", { redirect: "manual" });
        expect(res.status, ip).toBe(302);
        vi.unstubAllGlobals();
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    });
  });
});
