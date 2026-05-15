'use client';

import { Download } from 'lucide-react';
import { exportAuditToPdf } from '@/shared/utils/exportPdf';
import { useState } from 'react';

export function ExportPdfButton({ targetElementId }: { targetElementId: string }) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const brandingStr = localStorage.getItem('agencyBranding');
      const branding = brandingStr ? JSON.parse(brandingStr) : undefined;
      
      const success = await exportAuditToPdf(
        targetElementId, 
        `Auditoria-SEO-${new Date().toISOString().split('T')[0]}.pdf`,
        branding
      );
      
      if (!success) {
        alert('Hubo un error al generar el PDF. Por favor intenta de nuevo.');
      }
    } catch (e) {
      console.error(e);
      alert('Error al exportar.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button 
      onClick={handleExport}
      disabled={isExporting}
      className="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed no-print"
    >
      {isExporting ? (
        <svg className="animate-spin h-4 w-4 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : (
        <Download className="w-4 h-4" />
      )}
      {isExporting ? 'Generando PDF...' : 'Exportar Reporte PDF (White Label)'}
    </button>
  );
}
