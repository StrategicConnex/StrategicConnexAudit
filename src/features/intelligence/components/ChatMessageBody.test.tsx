import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChatMessageBody } from "./ChatMessageBody";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { count?: number }) =>
    typeof values?.count === "number" ? `${key}:${values.count}` : key,
}));

afterEach(cleanup);

const REFERENCE = { id: "f-1", title: "SPF ausente" };

describe("ChatMessageBody", () => {
  it("convierte una referencia verificada en enlace al hallazgo", () => {
    render(<ChatMessageBody text="Riesgo confirmado [[ref:1]]." references={[REFERENCE]} />);

    const link = screen.getByRole("link", { name: "[1]" });
    expect(link.getAttribute("href")).toBe("/intelligence?evidence=f-1#finding-f-1");
    expect(link.getAttribute("title")).toBe("SPF ausente");
  });

  it("un token sin referencia existente se pinta como texto y no como enlace", () => {
    const { container } = render(<ChatMessageBody text="Riesgo [[ref:2]]." references={[REFERENCE]} />);

    expect(screen.getByText(/\[\[ref:2\]\]/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "[2]" })).toBeNull();
    expect(container.querySelectorAll("p a")).toHaveLength(0);
  });

  it("un marcador crudo del modelo nunca se convierte en enlace", () => {
    const { container } = render(
      <ChatMessageBody text="Riesgo [[finding:inventado]]." references={[REFERENCE]} />,
    );

    expect(screen.getByText(/\[\[finding:inventado\]\]/)).toBeTruthy();
    expect(container.querySelectorAll("p a")).toHaveLength(0);
  });

  it("lista las referencias verificadas con su título", () => {
    render(<ChatMessageBody text="Riesgo [[ref:1]]." references={[REFERENCE]} />);

    expect(screen.getByText("referencesLabel")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "[1] SPF ausente" }).getAttribute("href"),
    ).toBe("/intelligence?evidence=f-1#finding-f-1");
  });

  it("muestra el contador de citas no verificadas", () => {
    render(<ChatMessageBody text="Respuesta sin enlaces." unverifiedCount={2} />);

    expect(screen.getByRole("status").textContent).toBe("citationUnverified:2");
  });

  it("no muestra contador cuando no hay citas sin verificar", () => {
    render(<ChatMessageBody text="Respuesta limpia." unverifiedCount={0} />);

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("trata el título de la referencia como texto, no como HTML", () => {
    const { container } = render(
      <ChatMessageBody
        text="Riesgo [[ref:1]]."
        references={[{ id: "f-1", title: '<img src=x onerror="alert(1)">' }]}
      />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(/<img src=x onerror="alert\(1\)">/)).toBeTruthy();
  });

  it("al abrir una referencia delega en el callback sin navegar", () => {
    const onOpenReference = vi.fn();
    render(
      <ChatMessageBody
        text="Riesgo [[ref:1]]."
        references={[REFERENCE]}
        onOpenReference={onOpenReference}
      />,
    );

    fireEvent.click(screen.getByRole("link", { name: "[1]" }));

    expect(onOpenReference).toHaveBeenCalledWith("f-1");
  });
});
