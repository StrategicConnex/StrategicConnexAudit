'use client';

import { useState } from 'react';
import { Download, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { logger } from '@/lib/logger';

/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT PortalPdfButton — descarga del informe en el portal público.
   Sin next-intl ni Toaster aquí (el portal no tiene providers): los
   estados pendiente/generando/listo/error son inline (spec §7.3).
   Semana 9 rediseño.
   ═══════════════════════════════════════════════════════════════════════ */

type Phase = 'idle' | 'generating' | 'done' | 'error';

export function PortalPdfButton({ targetElementId }: { targetElementId: string }) {
  const [phase, setPhase] = useState<Phase>('idle');

  const handleExport = async () => {
    if (phase === 'generating') return;
    setPhase('generating');
    try {
      const { exportAuditToPdf } = await import('@/shared/utils/exportPdf');
      const success = await exportAuditToPdf(
        targetElementId,
        `Informe-SEO-${new Date().toISOString().split('T')[0]}.pdf`,
      );
      setPhase(success ? 'done' : 'error');
      if (success) {
        setTimeout(() => setPhase((p) => (p === 'done' ? 'idle' : p)), 4000);
      }
    } catch (e) {
      logger.error('Error al exportar PDF del portal', {
        error: e instanceof Error ? e.message : String(e),
      });
      setPhase('error');
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        onClick={handleExport}
        disabled={phase === 'generating'}
        variant={phase === 'error' ? 'destructive' : 'corporate'}
        size="md"
        shape="pill"
        press="none"
        className="px-6"
      >
        {phase === 'generating' ? (
          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
        ) : phase === 'done' ? (
          <CheckCircle2 size={14} aria-hidden="true" />
        ) : phase === 'error' ? (
          <AlertCircle size={14} aria-hidden="true" />
        ) : (
          <Download size={14} aria-hidden="true" />
        )}
        {phase === 'generating'
          ? 'Generando PDF…'
          : phase === 'done'
            ? '¡Descargado!'
            : phase === 'error'
              ? 'Reintentar PDF'
              : 'Descargar informe PDF'}
      </Button>
      {phase === 'error' && (
        <p role="alert" className="text-2xs text-destructive">
          No se pudo generar el PDF. Inténtalo de nuevo.
        </p>
      )}
    </div>
  );
}
