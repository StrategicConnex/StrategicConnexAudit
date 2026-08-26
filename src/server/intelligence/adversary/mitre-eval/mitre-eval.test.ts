/**
 * Tests del motor MITRE real: mapeo técnica↔checks y checks nuevos
 * (email-spoofing con DNS mockeado, admin panels sin credenciales).
 */

import { describe, it, expect, vi } from "vitest";
import type { CheckContext } from "../assessment/types";

// ─── Mock de node:dns/promises antes de importar el check ──────────────────

const txtByDomain = new Map<string, string[][]>();
vi.mock("node:dns/promises", () => ({
  default: {
    resolveTxt: vi.fn(async (domain: string) => {
      const r = txtByDomain.get(domain);
      if (!r) throw new Error("ENOTFOUND");
      return r;
    }),
  },
}));

import { buildMitrePlans, getCheckById, MITRE_CHECK_POOL } from "./checks-map";
import { emailSpoofingCheck } from "../assessment/checks/mitre-checks";

function makeCtx(fetchMock?: CheckContext["fetch"]): CheckContext {
  return {
    host: "example.com",
    origin: "https://example.com",
    fetch: fetchMock ?? (async () => new Response("ok", { status: 200 })),
    timeoutMs: 5_000,
  };
}

describe("buildMitrePlans — mapeo catálogo ↔ checks", () => {
  it("cubre los 12 escenarios del catálogo", () => {
    const plans = buildMitrePlans();
    expect(plans).toHaveLength(12);
  });

  it("marca como no-testeables las técnicas internas/destructivas", () => {
    const plans = buildMitrePlans();
    const manualIds = plans.filter((p) => p.notExternallyTestable).map((p) => p.scenario.mitreId);
    expect(manualIds).toEqual(
      expect.arrayContaining(["T1059.001", "T1110.001", "T1557.001", "T1003.001", "T1490"])
    );
  });

  it("las técnicas testeables tienen todos sus checks en el pool", () => {
    for (const plan of buildMitrePlans()) {
      if (plan.notExternallyTestable) continue;
      if (plan.scenario.mitreId === "T1021.001") continue; // RDP usa tcpProbe directo
      expect(plan.checkIds.length).toBeGreaterThan(0);
      for (const id of plan.checkIds) {
        expect(getCheckById(id)).toBeDefined();
      }
    }
  });

  it("el pool incluye los 3 checks nuevos + los del assessment", () => {
    const ids = MITRE_CHECK_POOL.map((c) => c.id);
    expect(ids).toContain("email-spoofing");
    expect(ids).toContain("default-admin-panels");
    expect(ids).toContain("cloud-storage-public");
    expect(ids).toContain("sqli-error");
  });
});

describe("check email-spoofing (T1566) — SPF/DKIM/DMARC reales vía DNS", () => {
  it("dominio sin protección → finding high con hallazgos", async () => {
    txtByDomain.clear(); // nada configurado
    const res = await emailSpoofingCheck.run(makeCtx());

    expect(res.status).toBe("finding");
    expect(res.severity).toBe("high");
    const all = (res.evidence as { allFindings: string[] }).allFindings;
    expect(all.some((f) => f.includes("SPF"))).toBe(true);
    expect(all.some((f) => f.includes("DMARC"))).toBe(true);
  });

  it("dominio bien protegido → pass", async () => {
    txtByDomain.clear();
    txtByDomain.set("example.com", [["v=spf1 include:_spf.google.com -all"]]);
    txtByDomain.set("_dmarc.example.com", [["v=DMARC1; p=reject"]]);
    txtByDomain.set("default._domainkey.example.com", [["v=DKIM1; p=MIIBI"]]);

    const res = await emailSpoofingCheck.run(makeCtx());
    expect(res.status).toBe("pass");
  });

  it("DMARC p=none → medium (sin enforcement)", async () => {
    txtByDomain.clear();
    txtByDomain.set("example.com", [["v=spf1 -all"]]);
    txtByDomain.set("_dmarc.example.com", [["v=DMARC1; p=none"]]);

    const res = await emailSpoofingCheck.run(makeCtx());
    expect(res.status).toBe("finding");
    expect(res.severity).toBe("medium");
  });
});

describe("check default-admin-panels (T1078.001) — GET-only, sin credenciales", () => {
  it("panel WordPress expuesto → finding", async () => {
    const loginForm = '<html><body><form><input name="pwd" type="password"/></form></body></html>';
    const ctx = makeCtx(async (url) => {
      const u = String(url);
      if (u === "https://example.com/wp-login.php") return new Response(loginForm, { status: 200 });
      return new Response("nope", { status: 404 });
    });
    const res = await getCheckById("default-admin-panels")!.run(ctx);

    expect(res.status).toBe("finding");
    const exposed = (res.evidence as { exposed: Array<{ path: string; hint: string }> }).exposed;
    expect(exposed).toHaveLength(1);
    expect(exposed[0]!.hint).toBe("WordPress");
  });

  it("404 en todas las rutas → pass", async () => {
    const ctx = makeCtx(async () => new Response("nope", { status: 404 }));
    const res = await getCheckById("default-admin-panels")!.run(ctx);
    expect(res.status).toBe("pass");
  });
});
