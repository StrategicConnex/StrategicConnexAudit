import { exportElementToPdf } from './pdf-utils';
import { escapeHtml } from './html';

export interface IntelligenceBranding {
  name: string;
  color: string;
  logoUrl?: string;
}

/**
 * buildIntelligenceHeaderHtml — builds the intelligence PDF header HTML with
 * all user-controlled fields escaped (branding + targetName). Pure/testable.
 */
export function buildIntelligenceHeaderHtml(
  branding: IntelligenceBranding | undefined,
  targetName: string,
  dateTime: string
): string {
  const safeName = escapeHtml(branding?.name ?? '');
  const safeLogoUrl = escapeHtml(branding?.logoUrl ?? '');
  const safeTarget = escapeHtml(targetName);

  const logoHtml = branding?.logoUrl
    ? `<img src="${safeLogoUrl}" alt="${safeName} Logo" style="max-height: 45px; object-fit: contain;" crossorigin="anonymous"/>`
    : `<div style="display: flex; align-items: center; gap: 8px; color: #10b981;"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><span style="font-weight: 800; font-size: 18px; font-family: 'JetBrains Mono', monospace; tracking: -0.05em;">STRATEGIC_CONNEX</span></div>`;

  const titleHtml = `<h2 style="margin:0; font-family: 'Inter', sans-serif; font-size: 22px; font-weight: 900; color: #09090b; letter-spacing: -0.03em; text-transform: uppercase;">REPORTE DE SEGURIDAD PERIMETRAL</h2>`;

  return `
      <div style="display:flex; align-items:center; gap: 15px;">
        ${logoHtml}
        ${branding?.name ? `<span style="font-weight:700; font-size: 16px; font-family: 'Inter', sans-serif; opacity: 0.8; color: #71717a;">| ${safeName}</span>` : ''}
      </div>
      <div style="text-align: right;">
        ${titleHtml}
        <p style="margin:4px 0 0 0; color:#10b981; font-size: 12px; font-family: 'JetBrains Mono', monospace; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">OBJETIVO: ${safeTarget}</p>
        <p style="margin:2px 0 0 0; color:#71717a; font-size: 11px; font-family: 'JetBrains Mono', monospace;'>FECHA: ${escapeHtml(dateTime)}</p>
      </div>
    `;
}

const applyIntelligenceExportTheme = (clonedDoc: Document, _branding?: IntelligenceBranding) => {
  const colorSpaceRegex = /oklch|oklab|lab/gi;

  try {
    let combinedCss = '';
    const sheets = Array.from(document.styleSheets);
    for (const sheet of sheets) {
      try {
        const rules = Array.from(sheet.cssRules);
        for (const rule of rules) {
          combinedCss += rule.cssText + '\n';
        }
      } catch {
        // Ignore cross-origin stylesheets or other inaccessible rule sets.
      }
    }

    clonedDoc.querySelectorAll('style, link[rel="stylesheet"]').forEach(el => el.remove());

    const sanitizedCss = combinedCss.replace(colorSpaceRegex, 'rgb');

    const themeStyle = clonedDoc.createElement('style');
    themeStyle.textContent = `
      /* Fuentes del SISTEMA — sin @import de font CDNs de terceros: evitar
         fuga de IP + Referer en cada export de PDF. */

      body {
        font-family: 'Inter', sans-serif !important;
        background-color: #FFFFFF !important;
        color: #18181b !important;
        padding: 0 !important;
        margin: 0 !important;
      }

      .font-mono, [class*="font-mono"] {
        font-family: 'JetBrains Mono', monospace !important;
      }

      html, body { background-color: #FFFFFF !important; }

      .no-print, button, form, aside {
        display: none !important;
      }

      .flex-1 {
        width: 100% !important;
        max-width: 100% !important;
        flex: none !important;
      }

      * {
        white-space: normal !important;
        word-break: break-word !important;
        overflow: visible !important;
      }

      .fixed, .absolute {
        position: static !important;
        width: 100% !important;
        height: auto !important;
        transform: none !important;
      }

      .h-screen {
        height: auto !important;
      }

      .bg-\[\#0c0c0e\], .bg-zinc-950, .bg-[#0c0c0e], .bg-[#09090b], [class*="bg-zinc-"], [class*="bg-neutral-"] {
        background-color: #f4f4f5 !important;
        border: 1px solid #e4e4e7 !important;
        color: #18181b !important;
        border-radius: 8px !important;
      }

      .text-white, .text-\[\#e4e4e7\], .text-[#e4e4e7] {
        color: #09090b !important;
      }

      .text-[#a1a1aa], .text-[#71717a], .text-muted-foreground, .text-zinc-400, .text-zinc-500 {
        color: #52525b !important;
      }

      .bg-red-500\/10 {
        background-color: #fee2e2 !important;
        border-color: #fca5a5 !important;
        color: #b91c1c !important;
      }
      .text-red-400 {
        color: #b91c1c !important;
      }

      .bg-amber-500\/10 {
        background-color: #fef3c7 !important;
        border-color: #fcd34d !important;
        color: #b45309 !important;
      }
      .text-amber-400 {
        color: #b45309 !important;
      }

      .bg-chartreuse\/10 {
        background-color: #d1fae5 !important;
        border-color: #6ee7b7 !important;
        color: #047857 !important;
      }
      .text-chartreuse {
        color: #047857 !important;
      }

      .bg-blue-500\/10 {
        background-color: #dbeafe !important;
        border-color: #93c5fd !important;
        color: #1d4ed8 !important;
      }
      .text-blue-400 {
        color: #1d4ed8 !important;
      }

      ${sanitizedCss}
    `;

    clonedDoc.head.appendChild(themeStyle);
  } catch (error) {
    console.error('Intelligence PDF theme sanitization failed', error);
  }

  clonedDoc.querySelectorAll('.no-print, button, form, aside').forEach(el => {
    (el as HTMLElement).style.display = 'none';
  });
};

export const exportIntelligenceToPdf = async (
  elementId: string,
  filename: string,
  targetName: string,
  branding?: IntelligenceBranding
) => {
  const onBeforeExport = (element: HTMLElement) => {
    const headerDiv = document.createElement('div');
    headerDiv.className = 'pdf-branding-header';
    headerDiv.style.display = 'flex';
    headerDiv.style.alignItems = 'center';
    headerDiv.style.justifyContent = 'space-between';
    headerDiv.style.padding = '30px 40px';
    headerDiv.style.marginBottom = '20px';
    headerDiv.style.borderBottom = `4px solid ${branding?.color || '#10b981'}`;
    headerDiv.style.backgroundColor = '#FFFFFF';
    headerDiv.style.color = '#09090b';

    // XSS defense: branding + targetName are escaped inside the builder.
    headerDiv.innerHTML = buildIntelligenceHeaderHtml(
      branding,
      targetName,
      `${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES')}`
    );

    element.insertBefore(headerDiv, element.firstChild);
  };

  const onClone = (clonedDoc: Document) => {
    applyIntelligenceExportTheme(clonedDoc, branding);
  };

  const onAfterExport = (element: HTMLElement) => {
    const insertedHeader = element.querySelector('.pdf-branding-header');
    if (insertedHeader?.parentNode) {
      insertedHeader.parentNode.removeChild(insertedHeader);
    }
  };

  return exportElementToPdf(elementId, filename, {
    onBeforeExport,
    onClone,
    onAfterExport,
  });
};
