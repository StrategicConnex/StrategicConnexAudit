import { describe, it, expect, vi, beforeEach } from "vitest";

const safeFetchMock = vi.hoisted(() => vi.fn());
const resolve4Mock = vi.hoisted(() => vi.fn());

vi.mock("../security/egress-guard", () => ({ safeFetch: safeFetchMock }));
vi.mock("node:dns/promises", () => ({
  default: { resolve4: resolve4Mock },
  resolve4: resolve4Mock,
}));

import { runShadowDetection } from "./shadow-detector";

const resp = (status: number, text = "") => ({
  status,
  statusText: status === 200 ? "OK" : "Error",
  text: async () => text,
  headers: new Headers(),
});

describe("runShadowDetection — detección pasiva de shadow IT", () => {
  beforeEach(() => {
    safeFetchMock.mockReset();
    resolve4Mock.mockReset();
  });

  it("detecta bucket S3 público y genera hallazgo high + shadow IT", async () => {
    safeFetchMock.mockImplementation(async (url: string, opts: { method?: string }) => {
      if (opts.method === "HEAD") return resp(404);
      return resp(200);
    });
    resolve4Mock.mockRejectedValue(new Error("ENOTFOUND"));

    const result = await runShadowDetection("example.com", "proj-1", ["api.example.com"]);

    const buckets = result.assets.filter((a) => a.assetType === "cloud_bucket");
    expect(buckets.length).toBeGreaterThan(0);
    expect(buckets.some((b) => b.severity === "high")).toBe(true);

    const publicFinding = result.findings.find((f) => f.title.includes("Públicamente Accesible"));
    expect(publicFinding).toBeDefined();
    expect(publicFinding?.severity).toBe("high");

    const shadowFinding = result.findings.find((f) => f.title.includes("Shadow IT"));
    expect(shadowFinding).toBeDefined();
    expect(result.success).toBe(true);
  });

  it("bucket privado (403) se registra como asset info sin hallazgo público", async () => {
    safeFetchMock.mockImplementation(async (_url: string, opts: { method?: string }) => {
      if (opts.method === "HEAD") return resp(404);
      return resp(403);
    });
    resolve4Mock.mockRejectedValue(new Error("ENOTFOUND"));

    const result = await runShadowDetection("example.com", "proj-1", []);

    const buckets = result.assets.filter((a) => a.assetType === "cloud_bucket");
    expect(buckets.length).toBeGreaterThan(0);
    expect(result.findings.some((f) => f.title.includes("Públicamente Accesible"))).toBe(false);
  });

  it("sin buckets ni servicios huérfanos no genera hallazgos de shadow IT", async () => {
    safeFetchMock.mockImplementation(async () => resp(404));
    resolve4Mock.mockRejectedValue(new Error("ENOTFOUND"));

    const result = await runShadowDetection("example.com", "proj-1", []);

    expect(result.assets.length).toBe(0);
    expect(result.findings.length).toBe(0);
  });

  it("subdominio con DNS válido y HTTP caído genera dangling_service medium", async () => {
    safeFetchMock.mockImplementation(async (_url: string, opts: { method?: string }) => {
      if (opts.method === "HEAD") return resp(500);
      return resp(404);
    });
    resolve4Mock.mockResolvedValue(["203.0.113.50"]);

    const result = await runShadowDetection("example.com", "proj-1", []);

    const dangling = result.assets.filter((a) => a.assetType === "dangling_service");
    expect(dangling.length).toBeGreaterThan(0);
    expect(dangling[0].severity).toBe("medium");
    expect(result.findings.some((f) => f.title.includes("Shadow IT"))).toBe(true);
  });

  it("subdominio con DNS válido y HTTPS sin respuesta genera dangling_service low", async () => {
    safeFetchMock.mockImplementation(async (_url: string, opts: { method?: string }) => {
      if (opts.method === "HEAD") throw new Error("ETIMEDOUT");
      return resp(404);
    });
    resolve4Mock.mockResolvedValue(["203.0.113.50"]);

    const result = await runShadowDetection("example.com", "proj-1", []);

    const dangling = result.assets.filter((a) => a.assetType === "dangling_service");
    expect(dangling.length).toBeGreaterThan(0);
    expect(dangling.some((d) => d.severity === "low")).toBe(true);
  });

  it("error de safeFetch en fase de buckets no rompe la detección (try/catch)", async () => {
    safeFetchMock.mockRejectedValue(new Error("ETIMEDOUT"));
    resolve4Mock.mockRejectedValue(new Error("ENOTFOUND"));

    const result = await runShadowDetection("example.com", "proj-1", []);
    expect(result.success).toBe(true);
    expect(result.assets.length).toBe(0);
  });
});
