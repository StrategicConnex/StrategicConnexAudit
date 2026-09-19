import { Download, FileSpreadsheet } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { ExportPdfButton } from '@/features/dashboard/ExportPdfButton';
import { ExportCsvButton } from '@/features/dashboard/ExportCsvButton';

/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT AuditExportPanel — exportaciones del resultado (spec §7.2/7.3):
   PDF ejecutivo (render de la página) y CSV de keywords. Los estados de
   generación los muestra cada botón (progreso + toasts); el PDF del
   informe completo es el propio render multi-página. Semana 8 rediseño.
   ═══════════════════════════════════════════════════════════════════════ */

export function AuditExportPanel({
  projectId,
  pdfTargetId,
  auditCompleted,
}: {
  projectId: string;
  pdfTargetId: string;
  auditCompleted: boolean;
}) {
  return (
    <Card className="p-6 sm:p-8">
      <h2 className="text-xl font-bold tracking-tight text-foreground">
        Exportaciones
      </h2>
      <p className="mt-1 text-sm text-muted-fg">
        Descarga el resultado para presentarlo o analizarlo fuera de la plataforma.
      </p>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-4 rounded-xl border border-border bg-muted/20 p-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-destructive/20 bg-destructive/10 text-destructive">
            <Download size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-foreground">PDF Ejecutivo</p>
            <p className="truncate text-2xs text-muted-fg">
              {auditCompleted
                ? 'Resumen de 1-2 páginas para dirección'
                : 'Disponible al completarse la auditoría'}
            </p>
          </div>
          {auditCompleted && <ExportPdfButton targetElementId={pdfTargetId} />}
        </div>
        <div className="flex items-center gap-4 rounded-xl border border-border bg-muted/20 p-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-chartreuse/20 bg-chartreuse/10 text-chartreuse">
            <FileSpreadsheet size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-foreground">CSV Detallado</p>
            <p className="truncate text-2xs text-muted-fg">
              Keywords y posiciones para análisis
            </p>
          </div>
          <ExportCsvButton projectId={projectId} />
        </div>
      </div>
    </Card>
  );
}
