'use client';

import { Download, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';

export function ExportPdfButton({ targetElementId }: { targetElementId: string }) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Dynamic import: html2canvas + jsPDF (~412KB) only loads on demand —
      // keeps them out of the audit page's initial bundle.
      const { exportAuditToPdf } = await import('@/shared/utils/exportPdf');
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
    <Button
      onClick={handleExport}
      disabled={isExporting}
      variant="muted"
      size="md"
      shape="pill"
      press="none"
      className="no-print px-6 hover:bg-primary/20 hover:border-primary/40"
    >
      {isExporting ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="w-3.5 h-3.5" aria-hidden="true" />
      )}
      {isExporting ? 'Generating PDF...' : 'Export PDF Report'}
    </Button>
  );
}
