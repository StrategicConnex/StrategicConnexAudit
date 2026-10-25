import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { EvidencesList } from "./EvidencesList";

describe("EvidencesList — cuenta sin auditoría", () => {
  it("muestra el estado vacío honesto y ninguna evidencia demo", () => {
    render(
      <EvidencesList
        findings={[]}
        selectedEvidenceId={null}
        onSelectEvidence={() => {}}
      />,
    );

    expect(screen.getByText("evidencesEmpty")).toBeTruthy();
    expect(screen.queryByText(/SPF Mechanism Overlimit/)).toBeNull();
    expect(screen.queryByText("Demo")).toBeNull();
  });
});
