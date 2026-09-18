import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import UsagePage from "./page";

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1", email: "test@test.com" })),
}));

describe("UsagePage", () => {
  it("renders heading", async () => {
    render(await UsagePage());
    expect(screen.getByText("API Usage & Rate Limits")).toBeTruthy();
  });

  it("renders usage cards", async () => {
    render(await UsagePage());
    expect(screen.getAllByText("Requests (1min)").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Requests (1hr)").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Requests (1day)").length).toBeGreaterThanOrEqual(1);
  });
});
