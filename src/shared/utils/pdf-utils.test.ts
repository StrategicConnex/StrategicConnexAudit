import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const domToJpegMock = vi.hoisted(() => vi.fn());
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

vi.mock("modern-screenshot", () => ({ domToJpeg: domToJpegMock }));
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

const addEl = (id: string, rect: { width: number; height: number } = { width: 800, height: 800 }) => {
  const el = document.createElement("div");
  el.id = id;
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue(
    rect as DOMRect
  );
  document.body.appendChild(el);
  return el;
};

describe("pdf-utils — exportElementToPdf", () => {
  beforeEach(() => {
    domToJpegMock.mockReset();
    domToJpegMock.mockResolvedValue("data:image/jpeg;base64,AAA");
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
    expect(domToJpegMock).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("devuelve false si el elemento tiene dimensiones cero", async () => {
    addEl("pdf-zero", { width: 0, height: 200 });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ok = await exportElementToPdf("pdf-zero", "out.pdf");
    expect(ok).toBe(false);
    expect(domToJpegMock).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("genera el PDF con modern-screenshot y llama a save con el filename", async () => {
    addEl("pdf-target");

    const ok = await exportElementToPdf("pdf-target", "reporte.pdf");
    expect(ok).toBe(true);
    expect(domToJpegMock).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ scale: 2, backgroundColor: "#ffffff", quality: 0.95 })
    );
    expect(pdfInstances[0]!.save).toHaveBeenCalledWith("reporte.pdf");
    expect(document.body.classList.contains("pdf-export-active")).toBe(false);
  });

  it("añade páginas extra cuando la imagen supera la altura de página", async () => {
    // 210×2970 px ⇒ ratio 14.1 ⇒ ~4.1 páginas A4
    addEl("pdf-tall", { width: 210, height: 2970 });

    const ok = await exportElementToPdf("pdf-tall", "multi.pdf");
    expect(ok).toBe(true);
    expect(pdfInstances[0]!.addPage).toHaveBeenCalled();
    expect(pdfInstances[0]!.addImage.mock.calls.length).toBeGreaterThan(1);
  });

  it("invoca onBeforeExport y onAfterExport en el orden correcto", async () => {
    addEl("pdf-hooks");

    const order: string[] = [];
    const ok = await exportElementToPdf("pdf-hooks", "h.pdf", {
      onBeforeExport: () => order.push("before"),
      onAfterExport: () => order.push("after"),
    });
    expect(ok).toBe(true);
    expect(order).toEqual(["before", "after"]);
  });

  it("invoca onAfterExport en finally incluso si domToJpeg lanza", async () => {
    addEl("pdf-fail");
    domToJpegMock.mockRejectedValue(new Error("capture error"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const after = vi.fn();
    const ok = await exportElementToPdf("pdf-fail", "fail.pdf", { onAfterExport: after });
    expect(ok).toBe(false);
    expect(after).toHaveBeenCalledOnce();
    expect(document.body.classList.contains("pdf-export-active")).toBe(false);
    spy.mockRestore();
  });
});
