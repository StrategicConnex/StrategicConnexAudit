import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  calculateImpactScore,
  sortIssuesByImpact,
} from "@/components/issue-impact";
import { IssueList } from "@/components/IssueList";
import type { IssueItem } from "@/components/IssueCard";

/**
 * Semana 8 — resultados de auditoría: impacto, cards expandibles,
 * filtros y acciones (resolver persiste, ignorar es local).
 */

describe("calculateImpactScore", () => {
  it("crítico de seguridad puntúa máximo con urgencia alta", () => {
    const impact = calculateImpactScore({
      severity: "critical",
      category: "security",
    });
    expect(impact.score).toBe(100);
    expect(impact.urgency).toBe("Alta");
  });

  it("warning de performance puntúa menos", () => {
    const impact = calculateImpactScore({
      severity: "warning",
      category: "performance",
    });
    expect(impact.score).toBe(70);
    expect(impact.difficulty).toBe("Alta");
  });

  it("sortIssuesByImpact ordena descendente sin mutar", () => {
    const issues = [
      { severity: "info", category: "link" },
      { severity: "critical", category: "meta" },
    ];
    const sorted = sortIssuesByImpact(issues);
    expect(sorted[0].severity).toBe("critical");
    expect(issues[0].severity).toBe("info");
  });
});

const ISSUES: IssueItem[] = [
  {
    id: "1",
    severity: "critical",
    category: "meta",
    title: "Falta Title Tag",
    description: "No hay <title>.",
    recommendation: "Agrega un <title>.",
    url: "https://a.example.com/",
    fixed: false,
  },
  {
    id: "2",
    severity: "warning",
    category: "performance",
    title: "LCP alto",
    description: "LCP de 4s.",
    recommendation: null,
    url: "https://a.example.com/lenta",
    fixed: false,
  },
  {
    id: "3",
    severity: "info",
    category: "link",
    title: "Enlace roto",
    description: "404 en /vieja.",
    recommendation: "Redirige.",
    url: null,
    fixed: true,
  },
];

function renderList(onToggleFixed = vi.fn(async () => ({ data: { success: true } }))) {
  render(<IssueList issues={ISSUES} onToggleFixed={onToggleFixed} />);
  return { onToggleFixed };
}

describe("IssueList", () => {
  it("muestra conteo y todas las cards colapsadas", () => {
    renderList();
    expect(screen.getByText(/3 hallazgos/)).toBeInTheDocument();
    expect(screen.getByText("Falta Title Tag")).toBeInTheDocument();
    expect(
      screen.queryByText("No hay <title>."),
    ).not.toBeInTheDocument();
    cleanup();
  });

  it("expande la card con página afectada y recomendación", () => {
    renderList();
    fireEvent.click(screen.getByText("Falta Title Tag"));
    expect(screen.getByText("No hay <title>.")).toBeInTheDocument();
    expect(screen.getByText("https://a.example.com/")).toBeInTheDocument();
    expect(screen.getByText("Agrega un <title>.")).toBeInTheDocument();
    cleanup();
  });

  it("filtra por búsqueda y severidad", () => {
    renderList();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "lcp" },
    });
    expect(screen.getByText("LCP alto")).toBeInTheDocument();
    expect(screen.queryByText("Falta Title Tag")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Críticos" }));
    expect(screen.getByText("Falta Title Tag")).toBeInTheDocument();
    expect(screen.queryByText("LCP alto")).not.toBeInTheDocument();
    cleanup();
  });

  it("resolver persiste y muestra badge Resuelto", async () => {
    const { onToggleFixed } = renderList();
    fireEvent.click(screen.getByText("Falta Title Tag"));
    fireEvent.click(
      screen.getByRole("button", { name: "Marcar resuelto" }),
    );
    expect(onToggleFixed).toHaveBeenCalledWith({ issueId: "1", fixed: true });
    expect(await screen.findByText("Resuelto")).toBeInTheDocument();
    cleanup();
  });

  it("ignorar oculta con opción de restaurar", () => {
    renderList();
    fireEvent.click(screen.getByText("Falta Title Tag"));
    fireEvent.click(screen.getByRole("button", { name: "Ignorar" }));
    expect(screen.queryByText("Falta Title Tag")).not.toBeInTheDocument();
    expect(screen.getByText(/Mostrar 1 ignorados/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Mostrar 1 ignorados/));
    expect(screen.getByText("Falta Title Tag")).toBeInTheDocument();
    cleanup();
  });
});
