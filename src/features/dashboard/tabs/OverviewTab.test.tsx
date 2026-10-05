import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";

// Identidad estable dentro del factory (vi.mock se eleva; no referenciar fuera).
vi.mock("next-intl", () => {
  const t = (key: string) => key;
  return { useTranslations: () => t };
});

// next/dynamic en jsdom: el chunk diferido nunca debe cargarse en el test.
vi.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => {
    const DynamicStub = () => null;
    return DynamicStub;
  },
}));

import { OverviewTab } from "./OverviewTab";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function jsonResponse(payload: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
  });
}

describe("OverviewTab — fuente de salud del motor IA", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockImplementation((input: unknown) => {
      const url = String(input);
      if (url.includes("/api/intelligence/live")) {
        return jsonResponse({
          success: true,
          uptime: { checks: [], uptimePercent: null, avgLatencyMs: null },
        });
      }
      return jsonResponse({
        modelsHealthy: 3,
        modelsTotal: 5,
        overallStatus: "degraded",
        checkedAt: "2026-10-04T15:51:23.000Z",
      });
    });
  });

  it("lee la salud IA vía /api/ai/status y nunca llama a la ruta cron /api/ai/healthcheck", async () => {
    render(<OverviewTab dashboardData={[]} setActiveTab={vi.fn()} />);

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("/api/ai/status"))).toBe(true);
    });

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    // /api/ai/healthcheck exige Bearer CRON_SECRET: un fetch desde el navegador
    // siempre recibe 401 y el estado del motor jamás podría poblarse.
    expect(urls.some((u) => u.includes("/api/ai/healthcheck"))).toBe(false);
  });
});
