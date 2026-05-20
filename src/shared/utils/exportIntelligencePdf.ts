import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export interface IntelligenceBranding {
  name: string;
  color: string;
  logoUrl?: string;
}

export const exportIntelligenceToPdf = async (
  elementId: string, 
  filename: string, 
  targetName: string,
  branding?: IntelligenceBranding
) => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element with id ${elementId} not found`);
    return false;
  }

  // Add a class to indicate PDF generation is active
  document.body.classList.add('pdf-export-active');
  
  let headerDiv: HTMLDivElement | null = null;
  
  // Create a professional cybersecurity document header
  headerDiv = document.createElement('div');
  headerDiv.className = 'pdf-branding-header';
  headerDiv.style.display = 'flex';
  headerDiv.style.alignItems = 'center';
  headerDiv.style.justifyContent = 'space-between';
  headerDiv.style.padding = '30px 40px';
  headerDiv.style.marginBottom = '20px';
  headerDiv.style.borderBottom = `4px solid ${branding?.color || '#10b981'}`;
  headerDiv.style.backgroundColor = '#FFFFFF';
  headerDiv.style.color = '#09090b';

  const logoHtml = branding?.logoUrl 
    ? `<img src="${branding.logoUrl}" alt="${branding.name} Logo" style="max-height: 45px; object-fit: contain;" crossorigin="anonymous"/>` 
    : `<div style="display: flex; align-items: center; gap: 8px; color: #10b981;"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><span style="font-weight: 800; font-size: 18px; font-family: 'JetBrains Mono', monospace; tracking: -0.05em;">STRATEGIC_CONNEX</span></div>`;
    
  const titleHtml = `<h2 style="margin:0; font-family: 'Inter', sans-serif; font-size: 22px; font-weight: 900; color: #09090b; letter-spacing: -0.03em; text-transform: uppercase;">REPORTE DE SEGURIDAD PERIMETRAL</h2>`;
  
  headerDiv.innerHTML = `
    <div style="display:flex; align-items:center; gap: 15px;">
      ${logoHtml}
      ${branding?.name ? `<span style="font-weight:700; font-size: 16px; font-family: 'Inter', sans-serif; opacity: 0.8; color: #71717a;">| ${branding.name}</span>` : ''}
    </div>
    <div style="text-align: right;">
      ${titleHtml}
      <p style="margin:4px 0 0 0; color:#10b981; font-size: 12px; font-family: 'JetBrains Mono', monospace; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">OBJETIVO: ${targetName}</p>
      <p style="margin:2px 0 0 0; color:#71717a; font-size: 11px; font-family: 'JetBrains Mono', monospace;">FECHA: ${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES')}</p>
    </div>
  `;
  
  element.insertBefore(headerDiv, element.firstChild);

  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: 1200,
      onclone: (clonedDoc) => {
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
            } catch {}
          }

          clonedDoc.querySelectorAll('style, link[rel="stylesheet"]').forEach(el => el.remove());

          const sanitizedCss = combinedCss.replace(colorSpaceRegex, 'rgb');

          const themeStyle = clonedDoc.createElement('style');
          themeStyle.textContent = `
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
            
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

            #intelligence-report-content {
              background-color: #FFFFFF !important;
              padding: 30px !important;
              width: 1100px !important;
              margin: 0 auto !important;
            }

            html, body { background-color: #FFFFFF !important; }
            
            /* Box styling transformations for light-mode printable PDF */
            .bg-\\[\\#0c0c0e\\], .bg-zinc-950, .bg-[#0c0c0e], .bg-[#09090b], [class*="bg-zinc-"], [class*="bg-neutral-"] {
              background-color: #f4f4f5 !important;
              border: 1px solid #e4e4e7 !important;
              color: #18181b !important;
              border-radius: 8px !important;
            }

            /* Custom text color adjustments */
            .text-white, .text-\\[\\#e4e4e7\\], .text-[#e4e4e7] {
              color: #09090b !important;
            }
            
            .text-[#a1a1aa], .text-[#71717a], .text-muted-foreground, .text-zinc-400, .text-zinc-500 {
              color: #52525b !important;
            }

            /* Severity badge indicators */
            .bg-red-500\\/10 {
              background-color: #fee2e2 !important;
              border-color: #fca5a5 !important;
              color: #b91c1c !important;
            }
            .text-red-400 {
              color: #b91c1c !important;
            }
            
            .bg-amber-500\\/10 {
              background-color: #fef3c7 !important;
              border-color: #fcd34d !important;
              color: #b45309 !important;
            }
            .text-amber-400 {
              color: #b45309 !important;
            }

            .bg-emerald-500\\/10 {
              background-color: #d1fae5 !important;
              border-color: #6ee7b7 !important;
              color: #047857 !important;
            }
            .text-emerald-400 {
              color: #047857 !important;
            }

            .bg-blue-500\\/10 {
              background-color: #dbeafe !important;
              border-color: #93c5fd !important;
              color: #1d4ed8 !important;
            }
            .text-blue-400 {
              color: #1d4ed8 !important;
            }

            /* UI layout optimization */
            .no-print, button, form, .bg-[#09090b]/50, aside {
              display: none !important;
            }

            .flex-1 {
              width: 100% !important;
              max-width: 100% !important;
              flex: none !important;
            }

            /* Ensure all lines are broken properly and not cut */
            * {
              white-space: normal !important;
              word-break: break-word !important;
              overflow: visible !important;
            }
            
            /* Remove absolute and fixed positioning to flow naturally in PDF */
            .fixed, .absolute {
              position: static !important;
              width: 100% !important;
              height: auto !important;
              transform: none !important;
            }
            
            .h-screen {
              height: auto !important;
            }

            ${sanitizedCss}
          `;
          clonedDoc.head.appendChild(themeStyle);
        } catch (e) {
          console.error('Cybersecurity PDF style injection failed', e);
        }

        // Hide non-print elements in the clone
        clonedDoc.querySelectorAll('.no-print, button, form, aside').forEach(el => {
          (el as HTMLElement).style.display = 'none';
        });
      }
    });

    // A4 layout calculations
    const imgWidth = 210; // A4 width in mm
    const pageHeight = 297; // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    const pdf = new jsPDF('p', 'mm', 'a4');
    
    // Cover/First Page
    pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(filename);
    return true;
  } catch (error) {
    console.error('Error generating Intelligence PDF:', error);
    return false;
  } finally {
    document.body.classList.remove('pdf-export-active');
    if (headerDiv && headerDiv.parentNode) {
      headerDiv.parentNode.removeChild(headerDiv);
    }
  }
};
