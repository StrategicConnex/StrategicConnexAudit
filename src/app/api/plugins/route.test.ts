/* ═══════════════════════════════════════════════════════════════════════════
   Plugins API — Tests de endpoint (TD-03 lote 3)

   Verifica:
   - GET: auth (401), vista catalog por defecto (200), ?view=installed (200),
     vista desconocida → catalog (borde), error de servicio (500)
   - POST: auth (401), campos requeridos ausentes (400), install (200 +
     registro de executor), install fallido sin registro, uninstall sin
     instanceId (400), uninstall (200), acción desconocida (400), error (500)
   ═══════════════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ==== Mocks ================================================================

const mockGetUser = vi.fn();
const mockListPluginCatalog = vi.fn();
const mockListUserPlugins = vi.fn();
const mockInstallPlugin = vi.fn();
const mockUninstallPlugin = vi.fn();
const mockGetPluginPackage = vi.fn();
const mockRegisterSinglePluginExecutor = vi.fn();

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}));

vi.mock("@/server/intelligence/plugins/registry", () => ({
  listPluginCatalog: (...args: unknown[]) => mockListPluginCatalog(...args),
  listUserPlugins: (...args: unknown[]) => mockListUserPlugins(...args),
  installPlugin: (...args: unknown[]) => mockInstallPlugin(...args),
  uninstallPlugin: (...args: unknown[]) => mockUninstallPlugin(...args),
  getPluginPackage: (...args: unknown[]) => mockGetPluginPackage(...args),
}));

vi.mock("@/server/intelligence/plugins/plugin-executor", () => ({
  registerSinglePluginExecutor: (...args: unknown[]) =>
    mockRegisterSinglePluginExecutor(...args),
}));

vi.mock("@/lib/logger", () => ({
  getRequestContext: vi.fn(() => undefined),
  runWithRequestContext: <T>(_ctx: unknown, fn: () => T): T => fn(),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// ==== Helpers ==============================================================

function createRequest(method: string, query = "", body?: unknown): NextRequest {
  return new NextRequest(
    new Request(`http://localhost:3000/api/plugins${query}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

function createRawRequest(method: string, rawBody: string): NextRequest {
  return new NextRequest(
    new Request("http://localhost:3000/api/plugins", {
      method,
      headers: { "content-type": "application/json" },
      body: rawBody,
    }),
  );
}

function resetDefaults(): void {
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mockListPluginCatalog.mockResolvedValue([{ pkg: { id: "pkg-1" }, installed: false }]);
  mockListUserPlugins.mockResolvedValue([{ packageId: "pkg-1" }]);
  mockInstallPlugin.mockResolvedValue({ success: true, instanceId: "inst-1" });
  mockUninstallPlugin.mockResolvedValue(true);
  mockGetPluginPackage.mockResolvedValue({ id: "pkg-1", name: "seo-audit" });
  mockRegisterSinglePluginExecutor.mockResolvedValue(undefined);
}

// ==== Tests ================================================================

describe("Plugins API — GET", () => {
  let GET: typeof import("./route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetDefaults();
    const mod = await import("./route");
    GET = mod.GET;
  });

  it("GET without auth → 401", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await GET(createRequest("GET"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("No autorizado");
    expect(mockListPluginCatalog).not.toHaveBeenCalled();
  });

  it("GET default view → catalog", async () => {
    const res = await GET(createRequest("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.plugins).toHaveLength(1);
    expect(mockListPluginCatalog).toHaveBeenCalledWith("user-1");
    expect(mockListUserPlugins).not.toHaveBeenCalled();
  });

  it("GET view=installed → installed list", async () => {
    const res = await GET(createRequest("GET", "?view=installed"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.plugins).toHaveLength(1);
    expect(mockListUserPlugins).toHaveBeenCalledWith("user-1");
    expect(mockListPluginCatalog).not.toHaveBeenCalled();
  });

  it("GET unknown view → falls back to catalog", async () => {
    const res = await GET(createRequest("GET", "?view=nope"));
    expect(res.status).toBe(200);
    expect(mockListPluginCatalog).toHaveBeenCalledTimes(1);
    expect(mockListUserPlugins).not.toHaveBeenCalled();
  });

  it("GET empty catalog → empty plugins list", async () => {
    mockListPluginCatalog.mockResolvedValue([]);

    const res = await GET(createRequest("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plugins).toEqual([]);
  });

  it("GET service error → 500", async () => {
    mockListPluginCatalog.mockRejectedValue(new Error("registry down"));

    const res = await GET(createRequest("GET"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("Error interno del servidor");
  });
});

describe("Plugins API — POST", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetDefaults();
    const mod = await import("./route");
    POST = mod.POST;
  });

  it("POST without auth → 401", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(
      createRequest("POST", "", { action: "install", packageId: "pkg-1" }),
    );
    expect(res.status).toBe(401);
    expect(mockInstallPlugin).not.toHaveBeenCalled();
  });

  it("POST without action → 400", async () => {
    const res = await POST(createRequest("POST", "", { packageId: "pkg-1" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Faltan campos requeridos");
  });

  it("POST without packageId → 400", async () => {
    const res = await POST(createRequest("POST", "", { action: "install" }));
    expect(res.status).toBe(400);
    expect(mockInstallPlugin).not.toHaveBeenCalled();
  });

  it("POST install → 200 and registers executor", async () => {
    const res = await POST(
      createRequest("POST", "", {
        action: "install",
        packageId: "pkg-1",
        projectId: "proj-1",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockInstallPlugin).toHaveBeenCalledWith("pkg-1", "user-1", "proj-1");
    expect(mockGetPluginPackage).toHaveBeenCalledWith("pkg-1");
    expect(mockRegisterSinglePluginExecutor).toHaveBeenCalledWith("seo-audit");
  });

  it("POST install but package not found → no executor registered", async () => {
    mockGetPluginPackage.mockResolvedValue(null);

    const res = await POST(
      createRequest("POST", "", { action: "install", packageId: "pkg-1" }),
    );
    expect(res.status).toBe(200);
    expect(mockRegisterSinglePluginExecutor).not.toHaveBeenCalled();
  });

  it("POST install failed → no executor registered", async () => {
    mockInstallPlugin.mockResolvedValue({ success: false, error: "quota exceeded" });

    const res = await POST(
      createRequest("POST", "", { action: "install", packageId: "pkg-1" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe("quota exceeded");
    expect(mockGetPluginPackage).not.toHaveBeenCalled();
    expect(mockRegisterSinglePluginExecutor).not.toHaveBeenCalled();
  });

  it("POST install → executor registration failure does not break response", async () => {
    mockRegisterSinglePluginExecutor.mockRejectedValue(new Error("registry full"));

    const res = await POST(
      createRequest("POST", "", { action: "install", packageId: "pkg-1" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("POST install error → 500", async () => {
    mockInstallPlugin.mockRejectedValue(new Error("install blew up"));

    const res = await POST(
      createRequest("POST", "", { action: "install", packageId: "pkg-1" }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Error interno del servidor");
  });

  it("POST uninstall without instanceId → 400", async () => {
    const res = await POST(
      createRequest("POST", "", { action: "uninstall", packageId: "pkg-1" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Falta instanceId para desinstalar");
    expect(mockUninstallPlugin).not.toHaveBeenCalled();
  });

  it("POST uninstall → 200", async () => {
    const res = await POST(
      createRequest("POST", "", {
        action: "uninstall",
        packageId: "pkg-1",
        instanceId: "inst-1",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockUninstallPlugin).toHaveBeenCalledWith("inst-1", "user-1");
  });

  it("POST unknown action → 400", async () => {
    const res = await POST(
      createRequest("POST", "", { action: "sync", packageId: "pkg-1" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Acción desconocida: sync");
  });

  it("POST body not json → 500", async () => {
    const res = await POST(createRawRequest("POST", "not-json"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Error interno del servidor");
  });
});
