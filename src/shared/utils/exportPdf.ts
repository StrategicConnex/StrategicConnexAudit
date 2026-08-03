import { exportElementToPdf } from './pdf-utils';
import { escapeHtml } from './html';

export interface AgencyBranding {
  name: string;
  color: string;
  logoUrl: string;
}

/**
 * buildAuditHeaderHtml — builds the white-label PDF header HTML with all
 * user-controlled branding fields escaped (XSS defense). Pure and testable.
 * Returns empty string when there is no branding to show.
 */
export function buildAuditHeaderHtml(
  branding: AgencyBranding | undefined,
  generatedDate: string
): string {
  if (!branding || (!branding.name && !branding.logoUrl)) return '';

  const safeName = escapeHtml(branding.name);
  const safeLogoUrl = escapeHtml(branding.logoUrl);
  const safeColor = escapeHtml(branding.color || '#0C1929');

  const logoHtml = branding.logoUrl
    ? `<img src="${safeLogoUrl}" alt="${safeName} Logo" style="max-height: 50px; object-fit: contain;" crossorigin="anonymous"/>`
    : '';

  const titleHtml = `<h2 style="margin:0; font-family: 'Inter', sans-serif; font-size: 28px; font-weight: 800; color: ${safeColor}; letter-spacing: -0.02em;">AUDITORÍA ESTRATÉGICA</h2>`;

  return `
      <div style="display:flex; align-items:center; gap: 20px;">
        ${logoHtml}
        ${branding.name ? `<span style="font-weight:700; font-size: 20px; font-family: 'Inter', sans-serif; opacity: 0.8;">${safeName}</span>` : ''}
      </div>
      <div style="text-align: right;">
        ${titleHtml}
        <p style="margin:4px 0 0 0; color:#64748B; font-size: 13px; font-family: 'JetBrains Mono', monospace; font-weight: 500; text-transform: uppercase; letter-spacing: 0.1em;">Generado: ${escapeHtml(generatedDate)}</p>
      </div>
    `;
}

const applyAuditExportTheme = (clonedDoc: Document, branding?: AgencyBranding) => {
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
      /* High-impact PDF export theme */
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&family=Roboto:wght@400;500;700&display=swap');

      body {
        font-family: 'Inter', 'Roboto', sans-serif !important;
        background-color: #F8FAFC !important;
        color: #334155 !important;
        padding: 0 !important;
        margin: 0 !important;
      }

      .font-mono, [class*="font-mono"] {
        font-family: 'JetBrains Mono', monospace !important;
        letter-spacing: -0.02em !important;
      }

      html, body {
        background-color: #F8FAFC !important;
      }

      .glass-card, [class*="bg-neutral-"], [class*="bg-zinc-"], [class*="bg-slate-"], .bg-white\/\[0\.01\], .bg-white\/\[0\.02\] {
        background-color: #FFFFFF !important;
        border: 1px solid #E2E8F0 !important;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06) !important;
        border-radius: 12px !important;
        padding: 24px !important;
      }

      .bg-neutral-900\/60, .bg-neutral-950\/20 {
        background-color: #F8FAFC !important;
        border: 1px solid #E2E8F0 !important;
      }

      h1, h2, h3, h4, h5, h6 {
        color: #0C1929 !important;
        font-family: 'Inter', 'Roboto', sans-serif !important;
        font-weight: 700 !important;
      }

      .text-muted-foreground, .text-neutral-400, .text-neutral-300, .text-white\/80 {
        color: #64748B !important;
      }

      .text-\[\#8ab4f8\] {
        color: #1A0DAB !important;
      }

      .text-green-400, .text-green-500, .text-green-600 { color: #10B981 !important; }
      .bg-green-500\/10 { background-color: #D1FAE5 !important; border-color: #10B981 !important; }
      .text-red-400, .text-red-500, .text-red-600, .text-red-700, .text-destructive { color: #0284C7 !important; }
      .text-red-300 { color: #0EA5E9 !important; }
      .bg-red-50, .bg-red-100, .bg-red-500\/10, .bg-red-950\/20, .bg-destructive\/10 { background-color: #F0F9FF !important; border-color: #0EA5E9 !important; }
      .border-red-200, .border-red-500\/20, .border-red-500\/30, .border-destructive\/30 { border-color: #0EA5E9 !important; }
      .text-yellow-400, .text-yellow-500, .text-yellow-600 { color: #D97706 !important; }
      .bg-yellow-500\/10 { background-color: #FEF3C7 !important; border-color: #F59E0B !important; }
      .text-blue-400, .text-blue-500, .text-blue-600 { color: #2563EB !important; }
      .bg-blue-500\/10, .bg-blue-50 { background-color: #F0F9FF !important; border-color: #3B82F6 !important; border-left-width: 3px !important; }
      .industrial-border { border: 1px solid #E2E8F0 !important; }
      .cyber-grid {
        background-image: radial-gradient(#CBD5E1 0.5px, transparent 0.5px) !important;
        background-size: 15px 15px !important;
        background-color: #F8FAFC !important;
      }
      .text-technical {
        font-family: 'JetBrains Mono', monospace !important;
        text-transform: uppercase !important;
        letter-spacing: 0.05em !important;
      }

      .truncate {
        white-space: normal !important;
        overflow: visible !important;
        text-overflow: clip !important;
      }
      .line-clamp-2, .line-clamp-3, .line-clamp-4 {
        -webkit-line-clamp: unset !important;
        display: block !important;
      }

      * {
        overflow-x: visible !important;
        overflow-y: visible !important;
      }

      * {
        --tw-gradient-from: ${branding?.color || '#0C1929'} !important;
        --tw-gradient-to: transparent !important;
      }
      [class*="bg-gradient-"] {
        background-image: none !important;
        background-color: #FFFFFF !important;
        border: 1px solid #e2e8f0 !important;
      }

      .border-white\/5, .border-border\/50, .border-border\/20, .border-border\/40, .border-white\/10, .divide-border\/20 > :not([hidden]) ~ :not([hidden]) {
        border-color: #e5e7eb !important;
      }

      ${sanitizedCss}
    `;

    clonedDoc.head.appendChild(themeStyle);
  } catch (error) {
    console.error('Audit PDF theme sanitization failed', error);
  }

  clonedDoc.querySelectorAll('.no-print').forEach(el => {
    (el as HTMLElement).style.display = 'none';
  });
};

export const exportAuditToPdf = async (
  elementId: string,
  filename: string,
  branding?: AgencyBranding
) => {
  const onBeforeExport = (element: HTMLElement) => {
    if (!branding || (!branding.name && !branding.logoUrl)) return;

    const headerDiv = document.createElement('div');
    headerDiv.className = 'pdf-branding-header';
    headerDiv.style.display = 'flex';
    headerDiv.style.alignItems = 'center';
    headerDiv.style.justifyContent = 'space-between';
    headerDiv.style.padding = '30px 40px';
    headerDiv.style.marginBottom = '0px';
    headerDiv.style.borderBottom = `4px solid ${branding.color || '#0C1929'}`;
    headerDiv.style.backgroundColor = '#FFFFFF';
    headerDiv.style.color = '#0C1929';

    // XSS defense: all branding fields are escaped inside the builder.
    headerDiv.innerHTML = buildAuditHeaderHtml(
      branding,
      new Date().toLocaleDateString('es-ES')
    );

    element.insertBefore(headerDiv, element.firstChild);
  };

  const onClone = (clonedDoc: Document) => {
    applyAuditExportTheme(clonedDoc, branding);
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
