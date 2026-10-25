import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { TelemetryTimeline } from "./TelemetryTimeline";

describe("TelemetryTimeline — cuenta sin auditoría", () => {
  it("muestra el estado vacío honesto y ningún evento demo", () => {
    render(<TelemetryTimeline events={[]} isActive={false} />);

    expect(screen.getByText("telemetryEmptyIdle")).toBeTruthy();
    expect(screen.queryByText(/Hace 2 min/)).toBeNull();
    expect(screen.queryByText("Demo")).toBeNull();
  });

  it("con auditoría activa y sin eventos muestra el estado de conexión", () => {
    render(<TelemetryTimeline events={[]} isActive />);

    expect(screen.getByText("telemetryEmptyActive")).toBeTruthy();
  });
});
