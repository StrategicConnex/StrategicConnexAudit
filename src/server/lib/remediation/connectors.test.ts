import { describe, it, expect } from "vitest";
import { executeConnector, decryptConfig, CONNECTORS } from "./connectors";

describe("remediation connectors (C-2)", () => {
  it("expone 4 conectores documentados", () => {
    expect(CONNECTORS.map((c) => c.id)).toEqual([
      "cloudflare.purge_cache",
      "wordpress.update_plugin",
      "github.create_issue",
      "http.request",
    ]);
    for (const c of CONNECTORS) {
      expect(c.fields.length).toBeGreaterThan(0);
    }
  });

  it("falla sin config requerida (sin red)", async () => {
    await expect(
      executeConnector("cloudflare.purge_cache", {}, { title: "t", steps: [] })
    ).rejects.toThrow(/apiToken|zoneId/);
    await expect(
      executeConnector("github.create_issue", {}, { title: "t", steps: [] })
    ).rejects.toThrow(/token|owner|repo/);
    await expect(
      executeConnector("http.request", {}, { title: "t", steps: [] })
    ).rejects.toThrow(/url/);
  });

  it("conector desconocido lanza", async () => {
    await expect(
      executeConnector("nasa.lanzar" as never, {}, { title: "t", steps: [] })
    ).rejects.toThrow(/desconocido/);
  });

  it("decryptConfig: null → {} y legacy intacto", () => {
    expect(decryptConfig(null)).toEqual({});
    expect(decryptConfig("no-es-json")).toEqual({});
  });
});
