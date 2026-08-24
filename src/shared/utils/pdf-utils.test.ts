import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const html2canvasMock = vi.hoisted(() => vi.fn());
const pdfInstances = vi.hoisted(() => [] as Array<{
  addImage: ReturnType<typeof vi.fn>;
  addPage: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
}>);

vi.hoisted(() => {
  class JsPdfMock {
    addImage = vi.fn();
    addPage = vi.fn();
    save = vi.fn();
    constructor() {
      pdfInstances.push(this);
    }
  }
  return { JsPdfMock };
});

vi.mock("html2canvas", () => ({ default: html2canvasMock }));
vi.mock("jspdf", () => ({
  default: class JsPdfMock {
    addImage = vi.fn();
    addPage = vi.fn();
    save = vi.fn();
    constructor() {
      pdfInstances.push(this);
    }
  },
}));

import { exportElementToPdf } from "./pdf-utils";

const makeCanvas = (width: number, height: number) => ({
  width,
  height,
  toDataURL: vi.fn(() => "data:image/jpeg;base64,AAA"),
});

const addEl = (id: string) => {
  const el = document.createElement("div");
  el.id = id;
  document.body.appendChild(el);
  return el;
};

describe("pdf-utils — exportElementToPdf", () => {
  beforeEach(() => {
    html2canvasMock.mockReset();
    pdfInstances.length = 0;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    document.body.classList.remove("pdf-export-active");
  });

  it("devuelve false y loguea error si el elemento no existe", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ok = await exportElementToPdf("no-existe", "out.pdf");
    expect(ok).toBe(false);
    expect(html2canvasMock).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("genera el PDF y llama a save con el filename", async () => {
    addEl("pdf-target");
    html2canvasMock.mockResolvedValue(makeCanvas(800, 800));

    const ok = await exportElementToPdf("pdf-target", "reporte.pdf");
    expect(ok).toBe(true);
    expect(html2canvasMock).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ scale: 2, useCORS: true })
    );
    expect(pdfInstances[0]!.save).toHaveBeenCalledWith("reporte.pdf");
    expect(document.body.classList.contains("pdf-export-active")).toBe(false);
  });

  it("añade páginas extra cuando la imagen supera la altura de página", async () => {
    addEl("pdf-tall");
    // Alto 2970px → imgHeight >> 297mm → múltiples páginas
    html2canvasMock.mockResolvedValue(makeCanvas(210, 2970));

    const ok = await exportElementToPdf("pdf-tall", "multi.pdf");
    expect(ok).toBe(true);
    expect(pdfInstances[0]!.addPage).toHaveBeenCalled();
    expect(pdfInstances[0]!.addImage.mock.calls.length).toBeGreaterThan(1);
  });

  it("invoca onBeforeExport y onAfterExport en el orden correcto", async () => {
    addEl("pdf-hooks");
    html2canvasMock.mockResolvedValue(makeCanvas(100, 100));

    const order: string[] = [];
    const ok = await exportElementToPdf("pdf-hooks", "h.pdf", {
      onBeforeExport: () => order.push("before"),
      onAfterExport: () => order.push("after"),
    });
    expect(ok).toBe(true);
    expect(order).toEqual(["before", "after"]);
  });

  it("devuelve false si html2canvas lanza y limpia la clase", async () => {
    addEl("pdf-fail");
    html2canvasMock.mockRejectedValue(new Error("canvas error"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const ok = await exportElementToPdf("pdf-fail", "fail.pdf");
    expect(ok).toBe(false);
    expect(document.body.classList.contains("pdf-export-active")).toBe(false);
    spy.mockRestore();
  });

  it("onClone que lanza no rompe la exportación (catch interno)", async () => {
    addEl("pdf-clone");
    html2canvasMock.mockImplementation(async (_el: unknown, opts: { onclone: (d: Document) => void | Promise<void> }) => {
      await opts.onclone(document);
      return makeCanvas(100, 100);
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const ok = await exportElementToPdf("pdf-clone", "clone.pdf", {
      onClone: () => { throw new Error("hook fail"); },
    });
    expect(ok).toBe(true);
    spy.mockRestore();
  });
});
