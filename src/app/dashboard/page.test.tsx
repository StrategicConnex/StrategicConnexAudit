import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `/dashboard` no existía: la carpeta solo tenía `realtime/` y `usage/`, así
 * que entrar a `/dashboard` devolvía 404 en lugar de llevar al panel. Estos
 * tests fijan que la ruta existe y redirige a la raíz.
 */

const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

describe("/dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirige a la raíz en vez de renderizar un 404", async () => {
    const { default: DashboardRedirect } = await import("./page");

    DashboardRedirect();

    expect(mockRedirect).toHaveBeenCalledTimes(1);
    expect(mockRedirect).toHaveBeenCalledWith("/");
  });
});
