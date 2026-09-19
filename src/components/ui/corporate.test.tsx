import { describe, it, expect } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

/**
 * Semana 1 (adaptada) — tokens corporate del spec 2026-09-18 §3 cableados
 * a través de los componentes base existentes:
 * - Button variant="corporate" (azul #1E3A5F, hover #2563EB)
 * - Badge severidades critical | warning | info | success
 * - Card variant="interactive" (hover elevado + borde corporate)
 * Las variantes preexistentes (live/alert/neutral, glass, etc.) deben
 * seguir intactas.
 */

describe("corporate tokens en componentes base", () => {
  it("Button corporate aplica el azul corporativo", () => {
    const { container, unmount } = render(
      <Button variant="corporate">Auditar</Button>,
    );
    const btn = container.querySelector("button");
    expect(btn?.className).toContain("bg-corporate-primary");
    expect(btn?.className).toContain("hover:bg-corporate-primary-light");
    unmount();
    cleanup();
  });

  it("buttonVariants corporate genera clases sin romper las existentes", () => {
    expect(buttonVariants({ variant: "corporate" })).toContain(
      "bg-corporate-primary",
    );
    expect(buttonVariants({ variant: "primary" })).toContain("from-primary");
    expect(buttonVariants({ variant: "ghost" })).toContain("bg-transparent");
  });

  it.each([
    ["critical", "corporate-danger"],
    ["warning", "corporate-warning"],
    ["info", "corporate-primary-light"],
    ["success", "corporate-success"],
  ] as const)("Badge %s usa su token de severidad", (variant, token) => {
    const { container, unmount } = render(
      <Badge variant={variant}>{variant}</Badge>,
    );
    const badge = container.querySelector("span");
    expect(badge?.className).toContain(`text-${token}`);
    expect(badge?.className).toContain(`border-${token}/20`);
    unmount();
    cleanup();
  });

  it("Badge conserva las variantes semánticas originales", () => {
    const { container, unmount } = render(<Badge variant="live">live</Badge>);
    expect(container.querySelector("span")?.className).toContain(
      "text-chartreuse",
    );
    unmount();
    cleanup();
  });

  it("Card interactive aplica superficie, borde y hover corporativos", () => {
    const { container, unmount } = render(
      <Card variant="interactive">contenido</Card>,
    );
    const card = container.querySelector("div");
    expect(card?.className).toContain("bg-corporate-surface-elevated");
    expect(card?.className).toContain("border-corporate-border");
    expect(card?.className).toContain("shadow-corporate-card");
    expect(card?.className).toContain("hover:border-corporate-primary/20");
    unmount();
    cleanup();
  });

  it("Card conserva la variante glass por defecto", () => {
    const { container, unmount } = render(<Card>contenido</Card>);
    expect(container.querySelector("div")?.className).toContain("glass-card");
    unmount();
    cleanup();
  });
});
