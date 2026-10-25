import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { DashboardSkeleton } from "./DashboardSkeleton";

afterEach(cleanup);

describe("DashboardSkeleton · loading boundary estático (Task 0.10)", () => {
  it("renderiza el esqueleto sin scripts ni componentes cliente", () => {
    const { container } = render(<DashboardSkeleton />);

    const root = container.querySelector('[data-testid="dashboard-skeleton"]');
    expect(root).toBeTruthy();
    expect(root?.className).toContain("animate-pulse");
    expect(container.querySelector("main#main-content")).toBeTruthy();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("canvas")).toBeNull();
  });
});
