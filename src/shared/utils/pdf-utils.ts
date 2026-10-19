import { domToJpeg } from 'modern-screenshot';
import jsPDF from 'jspdf';

export interface PdfExportOptions {
  onBeforeExport?: (element: HTMLElement) => void;
  onAfterExport?: (element: HTMLElement) => void;
}

export async function exportElementToPdf(
  elementId: string,
  filename: string,
  options: PdfExportOptions = {}
): Promise<boolean> {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element with id ${elementId} not found`);
    return false;
  }

  document.body.classList.add('pdf-export-active');
  options.onBeforeExport?.(element);

  try {
    // ── Renderer: modern-screenshot (domToJpeg) ─────────────────────────────
    // El paint lo hace el motor CSS del navegador vía SVG foreignObject, así
    // que los tokens del design-system (Tailwind v4 + OKLCH) renderizan
    // nativamente. html2canvas@1.4.1 (abandonada, parser de colores en JS)
    // reventaba con `Error: Attempting to parse an unsupported color function
    // "oklch"` — reproducido 2026-10-19 contra los tokens reales de
    // globals.css (repro playwright en vivo).
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      console.error(`cannot export element with zero dimensions: ${elementId}`);
      return false;
    }

    const dataUrl = await domToJpeg(element, {
      scale: 2,
      backgroundColor: '#ffffff',
      quality: 0.95,
    });

    const imgWidth = 210;
    const pageHeight = 297;
    const imgHeight = (rect.height * imgWidth) / rect.width;
    let heightLeft = imgHeight;
    let position = 0;

    const pdf = new jsPDF('p', 'mm', 'a4');
    pdf.addImage(dataUrl, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(dataUrl, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(filename);
    return true;
  } catch (error) {
    console.error('Error generating PDF:', error);
    return false;
  } finally {
    document.body.classList.remove('pdf-export-active');
    options.onAfterExport?.(element);
  }
}
