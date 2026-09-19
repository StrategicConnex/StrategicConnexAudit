import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  AuditProgress,
  formatElapsed,
} from "@/components/AuditProgress";
import { AuditConfigModal } from "@/app/projects/[id]/components/AuditConfigModal";
import AuditControl from "@/app/projects/[id]/components/AuditControl";
import {
  startAuditAction,
  getAuditStatus,
  cancelAuditAction,
} from "@/app/actions/audits";

/**
 * Semana 7 — inicio y progreso de auditoría: modal de configuración,
 * progreso en tiempo real y cancelación.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/app/actions/audits", () => ({
  startAuditAction: vi.fn(),
  getAuditStatus: vi.fn(),
  cancelAuditAction: vi.fn(),
}));

const mockedStart = vi.mocked(startAuditAction);
const mockedStatus = vi.mocked(getAuditStatus);
const mockedCancel = vi.mocked(cancelAuditAction);

describe("formatElapsed", () => {
  it.each([
    [0, "00:00"],
    [7, "00:07"],
    [65, "01:05"],
    [600, "10:00"],
  ])("%is → %s", (secs, expected) => {
    expect(formatElapsed(secs)).toBe(expected);
  });
});

describe("AuditProgress", () => {
  it("muestra estado, páginas, tiempo y cancelar", () => {
    const onCancel = vi.fn();
    render(
      <AuditProgress
        status="running"
        progress={42}
        pagesScanned={7}
        elapsedSecs={65}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText("Ejecutando")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "42",
    );
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("01:05")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Cancelar auditoría/ }),
    );
    expect(onCancel).toHaveBeenCalledTimes(1);
    cleanup();
  });
});

describe("AuditConfigModal", () => {
  it("confirma la config por defecto con preview", () => {
    const onConfirm = vi.fn();
    render(
      <AuditConfigModal
        open
        onOpenChange={() => {}}
        projectName="Mi Tienda"
        onConfirm={onConfirm}
      />,
    );
    expect(
      screen.getByText("Completa · Nivel 3 · StrategicAuditBot/1.0"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Iniciar auditoría" }),
    );
    expect(onConfirm).toHaveBeenCalledWith({
      type: "full",
      depth: 3,
      userAgent: "StrategicAuditBot/1.0",
    });
    cleanup();
  });

  it("cambia tipo y profundidad antes de confirmar", () => {
    const onConfirm = vi.fn();
    render(
      <AuditConfigModal
        open
        onOpenChange={() => {}}
        projectName="Mi Tienda"
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Técnica/ }));
    fireEvent.click(screen.getByRole("button", { name: "Nivel 5" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Iniciar auditoría" }),
    );
    expect(onConfirm).toHaveBeenCalledWith({
      type: "technical",
      depth: 5,
      userAgent: "StrategicAuditBot/1.0",
    });
    cleanup();
  });
});

describe("AuditControl", () => {
  const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

  it("flujo completo: modal → progreso → cancelar", async () => {
    mockedStart.mockResolvedValue({
      data: { success: true, auditId: "a1" },
    } as never);
    mockedStatus.mockResolvedValue({
      data: { success: true, status: "running", pagesScanned: 3 },
    } as never);
    mockedCancel.mockResolvedValue({
      data: { success: true, status: "canceled" },
    } as never);

    render(<AuditControl projectId={PROJECT_ID} projectName="Mi Tienda" />);

    // 1. El botón abre el modal de configuración
    fireEvent.click(
      screen.getByRole("button", { name: "Iniciar auditoría" }),
    );
    expect(
      await screen.findByRole("dialog"),
    ).toBeInTheDocument();

    // 2. Confirmar inicia la auditoría y muestra el progreso
    fireEvent.click(
      screen.getByRole("button", { name: "Iniciar auditoría" }),
    );
    expect(await screen.findByRole("progressbar")).toBeInTheDocument();
    expect(mockedStart).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT_ID, type: "full" }),
    );

    // 3. Cancelar marca la auditoría como cancelada
    fireEvent.click(
      screen.getByRole("button", { name: /Cancelar auditoría/ }),
    );
    expect(await screen.findByText("Cancelado")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Nueva auditoría" }),
    ).toBeInTheDocument();
    cleanup();
  });
});
