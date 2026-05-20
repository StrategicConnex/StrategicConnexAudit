import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export interface AgencyBranding {
  name: string;
  color: string;
  logoUrl: string;
}

export const exportAuditToPdf = async (
  elementId: string, 
  filename: string, 
  branding?: AgencyBranding
) => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element with id ${elementId} not found`);
    return false;
  }

  // Add a class to indicate PDF generation is active (to hide buttons, etc.)
  document.body.classList.add('pdf-export-active');
  
  // Create a temporary branding header if branding is provided
  let headerDiv: HTMLDivElement | null = null;
  if (branding && (branding.name || branding.logoUrl)) {
    headerDiv = document.createElement('div');
    headerDiv.className = 'pdf-branding-header';
    headerDiv.style.display = 'flex';
    headerDiv.style.alignItems = 'center';
    headerDiv.style.justifyContent = 'space-between';
    headerDiv.style.padding = '30px 40px';
    headerDiv.style.marginBottom = '0px';
    headerDiv.style.borderBottom = `4px solid ${branding.color || '#0C1929'}`;
    headerDiv.style.backgroundColor = '#FFFFFF';
    headerDiv.style.color = '#0C1929';

    const logoHtml = branding.logoUrl 
      ? `<img src="${branding.logoUrl}" alt="${branding.name} Logo" style="max-height: 50px; object-fit: contain;" crossorigin="anonymous"/>` 
      : '';
      
    const titleHtml = `<h2 style="margin:0; font-family: 'Inter', sans-serif; font-size: 28px; font-weight: 800; color: ${branding.color || '#0C1929'}; letter-spacing: -0.02em;">AUDITORÍA ESTRATÉGICA</h2>`;
    
    headerDiv.innerHTML = `
      <div style="display:flex; align-items:center; gap: 20px;">
        ${logoHtml}
        ${branding.name ? `<span style="font-weight:700; font-size: 20px; font-family: 'Inter', sans-serif; opacity: 0.8;">${branding.name}</span>` : ''}
      </div>
      <div style="text-align: right;">
        ${titleHtml}
        <p style="margin:4px 0 0 0; color:#64748B; font-size: 13px; font-family: 'JetBrains Mono', monospace; font-weight: 500; text-transform: uppercase; letter-spacing: 0.1em;">Generado: ${new Date().toLocaleDateString('es-ES')}</p>
      </div>
    `;
    
    element.insertBefore(headerDiv, element.firstChild);
  }

  try {
    // Generate canvas
    const canvas = await html2canvas(element, {
      scale: 2, // Higher resolution for high impact
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff', // Professional white background
      windowWidth: 1100, // Optimized width to prevent text cutting
      onclone: (clonedDoc) => {
        const colorSpaceRegex = /oklch|oklab|lab/gi;

        // 0. High Impact Light Theme Styles
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
            /* =========================================
               HIGH IMPACT LIGHT THEME FOR PDF EXPORT
               ========================================= */
            
            /* 1. Global Setup & Typography */
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&family=Roboto:wght@400;500;700&display=swap');
            
            body {
              font-family: 'Inter', 'Roboto', sans-serif !important;
              background-color: #F8FAFC !important; /* Blanco Técnico */
              color: #334155 !important;
              padding: 0 !important;
              margin: 0 !important;
            }
            
            /* JetBrains Mono for metrics and codes */
            .font-mono, [class*="font-mono"] {
              font-family: 'JetBrains Mono', monospace !important;
              letter-spacing: -0.02em !important;
            }

            #pdf-export-content {
              background-color: #F8FAFC !important;
              padding: 40px !important;
              width: 1000px !important; /* Fixed width for better layout control */
              margin: 0 auto !important;
            }

            /* Force white background for all container ancestors during export */
            html, body { background-color: #F8FAFC !important; }
            
            /* 2. Structural Elements (Cards & Containers) */
            /* Convert dark glass/neutral backgrounds to clean white cards */
            .glass-card, [class*="bg-neutral-"], [class*="bg-zinc-"], [class*="bg-slate-"], .bg-white\\/\\[0\\.01\\], .bg-white\\/\\[0\\.02\\] {
              background-color: #FFFFFF !important;
              border: 1px solid #E2E8F0 !important;
              box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06) !important;
              border-radius: 12px !important;
              padding: 24px !important;
            }
            
            /* Specific fix for sub-containers like Google Snippet */
            .bg-neutral-900\\/60, .bg-neutral-950\\/20 {
              background-color: #F8FAFC !important;
              border: 1px solid #E2E8F0 !important;
            }

            /* 3. Typography & Text Readability */
            h1, h2, h3, h4, h5, h6 { 
              color: #0C1929 !important; /* Azul Petróleo Profundo */
              font-family: 'Inter', 'Roboto', sans-serif !important;
              font-weight: 700 !important;
            }
            
            /* Darken muted text for white background */
            .text-muted-foreground, .text-neutral-400, .text-neutral-300, .text-white\\/80 {
              color: #64748B !important; /* Gris Acero Industrial */
            }
            
            /* Fix Google Snippet Title */
            .text-\\[\\#8ab4f8\\] {
              color: #1A0DAB !important; /* Authentic Google blue */
            }

            /* 4. Semantic Colors (Darker for contrast on white) */
            /* Green (Óptimo) */
            .text-green-400, .text-green-500, .text-green-600 { color: #10B981 !important; }
            .bg-green-500\\/10 { background-color: #D1FAE5 !important; border-color: #10B981 !important; }
            
            /* Red -> Light Blue (Requested by user for White Label PDF) */
            .text-red-400, .text-red-500, .text-red-600, .text-red-700, .text-destructive { color: #0284C7 !important; }
            .text-red-300 { color: #0EA5E9 !important; }
            .bg-red-50, .bg-red-100, .bg-red-500\\/10, .bg-red-950\\/20, .bg-destructive\\/10 { background-color: #F0F9FF !important; border-color: #0EA5E9 !important; }
            .border-red-200, .border-red-500\\/20, .border-red-500\\/30, .border-destructive\\/30 { border-color: #0EA5E9 !important; }
            
            /* Yellow/Warning (Aviso) */
            .text-yellow-400, .text-yellow-500, .text-yellow-600 { color: #D97706 !important; }
            .bg-yellow-500\\/10 { background-color: #FEF3C7 !important; border-color: #F59E0B !important; }
            
            /* Blue (Enlaces y Planes de Acción) */
            .text-blue-400, .text-blue-500, .text-blue-600 { color: #2563EB !important; }
            .bg-blue-500\\/10, .bg-blue-50 { background-color: #F0F9FF !important; border-color: #3B82F6 !important; border-left-width: 3px !important; }
            
            /* Industrial Utilities Support */
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

            /* 5. Fix Layout & "Cut in Half" Text Issues */
            .truncate { 
              white-space: normal !important; 
              overflow: visible !important; 
              text-overflow: clip !important;
            }
            .line-clamp-2, .line-clamp-3, .line-clamp-4 { 
              -webkit-line-clamp: unset !important; 
              display: block !important; 
            }
            
            /* Ensure all elements can expand */
            * {
              overflow-x: visible !important;
              overflow-y: visible !important;
            }

            /* 6. Safely kill gradients to prevent html2canvas parsing crashes */
            * {
              --tw-gradient-from: ${branding?.color || '#0C1929'} !important;
              --tw-gradient-to: transparent !important;
            }
            [class*="bg-gradient-"] {
              background-image: none !important;
              background-color: #FFFFFF !important;
              border: 1px solid #e2e8f0 !important;
            }

            /* Extra overrides for borders */
            .border-white\\/5, .border-border\\/50, .border-border\\/20, .border-border\\/40, .border-white\\/10, .divide-border\\/20 > :not([hidden]) ~ :not([hidden]) {
              border-color: #e5e7eb !important;
            }

            ${sanitizedCss}
          `;
          clonedDoc.head.appendChild(themeStyle);
        } catch (e) {
          console.error('Theme sanitization failed', e);
        }

        // 1. Element-level cleanup
        const allElements = clonedDoc.querySelectorAll('*');
        allElements.forEach(node => {
          const el = node as HTMLElement;
          
          // Keyword neutralization
          const styleAttr = el.getAttribute('style');
          if (styleAttr && colorSpaceRegex.test(styleAttr)) {
            el.setAttribute('style', styleAttr.replace(colorSpaceRegex, 'rgb'));
          }

          // SVG 
          const svgAttrs = ['fill', 'stroke', 'stop-color'];
          svgAttrs.forEach(attr => {
            const val = el.getAttribute(attr);
            if (val && colorSpaceRegex.test(val)) {
              el.setAttribute(attr, branding?.color || '#3b82f6');
            }
          });

          // Impact Branding
          if (branding?.color) {
            if (el.classList.contains('brand-color-target')) {
              el.style.setProperty('background-color', branding.color, 'important');
              el.style.setProperty('color', '#ffffff', 'important');
            }
            if (el.classList.contains('brand-text-target')) {
              el.style.setProperty('color', branding.color, 'important');
            }
          }
        });

        // Hide non-print
        clonedDoc.querySelectorAll('.no-print').forEach(el => {
          (el as HTMLElement).style.display = 'none';
        });
      }
    });

    // Calculate dimensions
    const imgWidth = 210; // A4 width in mm
    const pageHeight = 297; // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    // Create PDF
    const pdf = new jsPDF('p', 'mm', 'a4');
    
    // Add first page
    pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    // Add subsequent pages if content is long
    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(filename);
    return true;
  } catch (error) {
    console.error('Error generating PDF:', error);
    return false;
  } finally {
    // Clean up
    document.body.classList.remove('pdf-export-active');
    if (headerDiv && headerDiv.parentNode) {
      headerDiv.parentNode.removeChild(headerDiv);
    }
  }
};
