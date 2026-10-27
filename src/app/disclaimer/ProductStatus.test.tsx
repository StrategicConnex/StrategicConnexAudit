// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ProductStatus, type ProductStatusMessages } from "./ProductStatus";
import es from "./es.json";
import en from "./en.json";

const esMessages = (es as { disclaimer: { status: ProductStatusMessages } }).disclaimer.status;
const enMessages = (en as { disclaimer: { status: ProductStatusMessages } }).disclaimer.status;

beforeEach(() => {
  cleanup();
});

describe("ProductStatus", () => {
  it("muestra lo resuelto y lo que está en implementación (es)", () => {
    render(<ProductStatus messages={esMessages} />);

    expect(screen.getByRole("heading", { name: esMessages.title })).toBeDefined();
    expect(screen.getByText(esMessages.resolvedTitle)).toBeDefined();
    expect(screen.getByText(esMessages.inProgressTitle)).toBeDefined();

    for (const item of esMessages.resolved) {
      expect(screen.getByText(item, { exact: false })).toBeDefined();
    }
    for (const item of esMessages.inProgress) {
      expect(screen.getByText(item, { exact: false })).toBeDefined();
    }

    expect(screen.getByText(esMessages.note)).toBeDefined();
  });

  it("renderiza la versión inglesa con ambas columnas", () => {
    render(<ProductStatus messages={enMessages} />);

    expect(screen.getByText(enMessages.resolvedTitle)).toBeDefined();
    expect(screen.getByText(enMessages.inProgressTitle)).toBeDefined();
    expect(screen.getByText(enMessages.note)).toBeDefined();
  });
});
