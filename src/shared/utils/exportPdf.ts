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
    headerDiv.style.padding = '20px';
    headerDiv.style.marginBottom = '20px';
    headerDiv.style.borderBottom = `4px solid ${branding.color || '#3b82f6'}`;
    headerDiv.style.backgroundColor = '#111111'; // Match dark theme
    headerDiv.style.color = '#ffffff';

    const logoHtml = branding.logoUrl 
      ? `<img src="${branding.logoUrl}" alt="${branding.name} Logo" style="max-height: 40px; object-fit: contain;" crossorigin="anonymous"/>` 
      : '';
      
    const titleHtml = `<h2 style="margin:0; font-family: sans-serif; font-size: 24px;">Reporte de Auditoría SEO</h2>`;
    
    headerDiv.innerHTML = `
      <div style="display:flex; align-items:center; gap: 16px;">
        ${logoHtml}
        ${branding.name ? `<span style="font-weight:bold; font-size: 18px; font-family: sans-serif;">${branding.name}</span>` : ''}
      </div>
      <div>
        ${titleHtml}
        <p style="margin:0; text-align:right; color:#888; font-size: 12px; font-family: sans-serif;">Generado el ${new Date().toLocaleDateString()}</p>
      </div>
    `;
    
    element.insertBefore(headerDiv, element.firstChild);
  }

  try {
    // Generate canvas
    const canvas = await html2canvas(element, {
      scale: 2, // Higher resolution
      useCORS: true, // Allow loading external images like the logo
      logging: false,
      backgroundColor: '#0a0a0a', // Match app background
      windowWidth: 1200, // Fixed width for consistent rendering
      onclone: (clonedDoc) => {
        // html2canvas fails on modern CSS color functions like lab() or oklch()
        // We need to sanitize the styles of the cloned document
        const allElements = clonedDoc.getElementsByTagName('*');
        for (let i = 0; i < allElements.length; i++) {
          const el = allElements[i] as HTMLElement;
          
          // Check for background and text colors that might use unsupported formats
          if (el.style) {
            const bg = el.style.backgroundColor;
            const color = el.style.color;
            const borderColor = el.style.borderColor;

            if (bg && (bg.includes('lab(') || bg.includes('oklch('))) {
              el.style.backgroundColor = '#111111'; // Fallback to dark
            }
            if (color && (color.includes('lab(') || color.includes('oklch('))) {
              el.style.color = '#ffffff'; // Fallback to white
            }
            if (borderColor && (borderColor.includes('lab(') || borderColor.includes('oklch('))) {
              el.style.borderColor = '#333333'; // Fallback to dark gray
            }
          }
        }

        // Find elements that should be hidden in PDF and hide them
        const hiddenElements = clonedDoc.querySelectorAll('.no-print');
        hiddenElements.forEach(el => {
          (el as HTMLElement).style.display = 'none';
        });
        
        // If there's a specific primary color to apply from branding
        if (branding?.color) {
          const brandElements = clonedDoc.querySelectorAll('.brand-color-target');
          brandElements.forEach(el => {
            (el as HTMLElement).style.backgroundColor = branding.color;
          });
          const brandTextElements = clonedDoc.querySelectorAll('.brand-text-target');
          brandTextElements.forEach(el => {
            (el as HTMLElement).style.color = branding.color;
          });
        }
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
