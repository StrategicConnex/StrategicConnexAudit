import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { TrendChart, trendCoords } from "@/components/TrendChart";
import { ClientScoreCard } from "@/components/ClientScoreCard";
import { PortalPdfButton } from "@/app/p/[token]/components/PortalPdfButton";
import { healthScoreFor } from "@/components/issue-impact";

/**
 * Semana 9 — portal cliente: score card, tendencia y exportación PDF.
 */

vi.mock("@/shared/utils/exportPdf", () => ({
  exportAuditToPdf: vi.fn(),
}));

import { exportAuditToPdf } from "@/shared/utils/exportPdf";

const mockedExport = vi.mocked(exportAuditToPdf);

describe("healthScoreFor", () => {
  it.each([
    [0, 0, 100],
    [2, 0, 70],
    [0, 4, 80],
    [10, 10, 0],
  ])("%i críticos, %i avisos → %i", (c, w, expected) => {
    expect(healthScoreFor(c, w)).toBe(expected);
  });
});

describe("trendCoords", () => {
  it("vacío no dibuja", () => {
    expect(trendCoords([])).toBe("");
  });

  it("mapea min abajo y max arriba", () => {
    expect(
      trendCoords([
        { label: "a", value: 0 },
        { label: "b", value: 100 },
      ]),
    ).toBe("16.0,204.0 584.0,16.0");
  });

  it("línea plana la centra", () => {
    expect(
      trendCoords([
        { label: "a", value: 80 },
        { label: "b", value: 80 },
      ]),
    ).toBe("16.0,110.0 584.0,110.0");
  });
});

describe("TrendChart", () => {
  it("muestra línea, último valor y tabla oculta", () => {
    const { container } = render(
      <TrendChart
        points={[
          { label: "01 ene", value: 70 },
          { label: "02 ene", value: 85 },
        ]}
        ariaLabel="Evolución"
        emptyLabel="Vacío"
      />,
    );
    expect(screen.getByRole("img", { name: "Evolución" })).toBeInTheDocument();
    expect(screen.getByText("85/100")).toBeInTheDocument();
    // La tabla oculta expone los 2 puntos a lectores de pantalla
    expect(container.querySelectorAll("table tbody tr")).toHaveLength(2);
    cleanup();
  });

  it("vacío muestra el mensaje", () => {
    render(<TrendChart points={[]} ariaLabel="E" emptyLabel="Vacío" />);
    expect(screen.getByText("Vacío")).toBeInTheDocument();
    cleanup();
  });
});

describe("ClientScoreCard", () => {
  it("score general y categorías", () => {
    render(
      <ClientScoreCard
        overall={85}
        overallLabel="Salud"
        categories={[
          { label: "SEO técnico", value: 90 },
          { label: "Seguridad", value: null },
        ]}
        accent="#123456"
      />,
    );
    expect(screen.getByRole("img", { name: "Salud" })).toBeInTheDocument();
    expect(screen.getByText("85")).toBeInTheDocument();
    expect(screen.getByText("SEO técnico")).toBeInTheDocument();
    expect(screen.getByText("Seguridad")).toBeInTheDocument();
    cleanup();
  });

  it("sin auditorías lo dice", () => {
    render(
      <ClientScoreCard overall={null} overallLabel="Salud" categories={[]} />,
    );
    expect(
      screen.getByText("Aún no hay auditorías completadas."),
    ).toBeInTheDocument();
    cleanup();
  });
});

describe("PortalPdfButton", () => {
  it("genera y marca descargado", async () => {
    mockedExport.mockResolvedValue(true);
    render(<PortalPdfButton targetElementId="portal-export-content" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Descargar informe PDF" }),
    );
    expect(
      await screen.findByRole("button", { name: "¡Descargado!" }),
    ).toBeInTheDocument();
    expect(mockedExport).toHaveBeenCalledWith(
      "portal-export-content",
      expect.stringMatching(/^Informe-SEO-/),
    );
    cleanup();
  });

  it("muestra error y reintento si falla", async () => {
    mockedExport.mockResolvedValue(false);
    render(<PortalPdfButton targetElementId="portal-export-content" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Descargar informe PDF" }),
    );
    expect(
      await screen.findByRole("button", { name: "Reintentar PDF" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    cleanup();
  });
});
