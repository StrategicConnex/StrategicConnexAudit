import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ErrorState } from "./ErrorState";

// vitest corre sin `globals: true`: el cleanup es explícito (convención del repo).
afterEach(() => cleanup());

describe("ErrorState", () => {
  it("se anuncia como alerta para lectores de pantalla", () => {
    render(<ErrorState title="No se pudo cargar la telemetría" />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("No se pudo cargar la telemetría")).toBeTruthy();
  });

  it("muestra la descripción y el detalle técnico cuando se pasan", () => {
    render(
      <ErrorState
        title="Falló la auditoría"
        description="Reintenta en unos segundos."
        detail={"500 Internal Server Error"}
      />,
    );
    expect(screen.getByText("Reintenta en unos segundos.")).toBeTruthy();
    expect(screen.getByText("500 Internal Server Error")).toBeTruthy();
  });

  it("llama a onRetry al pulsar el botón", () => {
    const onRetry = vi.fn();
    render(<ErrorState title="Error de red" onRetry={onRetry} />);

    screen.getByRole("button", { name: /reintentar/i }).click();

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("acepta una etiqueta de reintento personalizada", () => {
    const onRetry = vi.fn();
    render(<ErrorState title="Error" onRetry={onRetry} retryLabel="Volver a intentar" />);

    screen.getByRole("button", { name: "Volver a intentar" }).click();

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("no renderiza botón si no hay acción de reintento", () => {
    render(<ErrorState title="Error sin recuperación" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
