'use client';

import { Download, Loader2 } from 'lucide-react';
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
      className="h-10 px-6 rounded-full text-[10px] font-bold uppercase tracking-[0.1em] transition-all flex items-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed no-print
        bg-muted/30 text-foreground hover:bg-primary/20 hover:text-white border border-border/30 hover:border-primary/40 shadow-sm hover:shadow-md"
    >
      {isExporting ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Download className="w-3.5 h-3.5" />
      )}
      {isExporting ? 'Generating PDF...' : 'Export PDF Report'}
    </button>
  );
}
