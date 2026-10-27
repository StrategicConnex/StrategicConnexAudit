import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { DashboardContentSkeleton } from "./DashboardContentSkeleton";

afterEach(cleanup);

describe("DashboardContentSkeleton · fallback del shell (H-10b F-B/F-C)", () => {
  it("es contentful (texto real), estático y sin scripts", () => {
    const { container } = render(<DashboardContentSkeleton />);

    const root = container.querySelector('[data-testid="dashboard-content-skeleton"]');
    expect(root).toBeTruthy();
    expect(root?.className).toContain("animate-pulse");

    // Texto real: sin él el fallback no sería contentful, y es el marcador
    // de deploy que lee scripts/e2e/lcp-diag.mjs (hasSkeletonText).
    expect(screen.getByText("Cargando tu portafolio…")).toBeTruthy();

    // Puro markup: ni scripts de preinit sin nonce (Task 0.10) ni canvas.
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("canvas")).toBeNull();
  });
});
