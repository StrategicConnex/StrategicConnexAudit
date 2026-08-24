'use client';

import React, { useState, useRef, useCallback } from 'react';
import {
  FileText, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { PdfProgressBar } from './PdfProgressBar';

interface DownloadPdfButtonProps {
  projectId: string;
  investigationId?: string;
  label?: string;
  variant?: 'primary' | 'ghost';
  size?: 'sm' | 'md';
}

/**
 * DownloadPdfButton — triggers PDF generation with real-time progress via SSE.
 *
 * Flow:
 * 1. Generate a unique genId (crypto.randomUUID)
 * 2. Show a toast with PdfProgressBar component
 * 3. Open EventSource → /api/reports/pdf/progress?genId=<id>
 * 4. Send POST /api/reports/pdf with genId in body
 * 5. PdfProgressBar receives SSE events and updates the progress bar
 * 6. When the POST returns the PDF blob, toast transitions to success
 * 7. If error, toast transitions to error
 */
export function DownloadPdfButton({
  projectId,
  investigationId,
  label = 'Descargar PDF',
  variant = 'primary',
  size = 'md',
}: DownloadPdfButtonProps) {
  const [loading, setLoading] = useState(false);
  const toastIdRef = useRef<string | number | null>(null);
  const genIdRef = useRef<string | null>(null);
  const abortedRef = useRef(false);

  const handleDownload = useCallback(async () => {
    if (!projectId) {
      toast.warning('Selecciona un proyecto primero', {
        description: 'No hay proyecto activo para generar el reporte.',
      });
      return;
    }

    // Reset state
    abortedRef.current = false;
    setLoading(true);

    // Generate unique generation ID for SSE tracking
    const genId = crypto.randomUUID();
    genIdRef.current = genId;

    // Show toast with progress bar
    toastIdRef.current = toast(
      <div className="w-full space-y-3">
        <div className="flex items-center gap-2.5">
          <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2.5">
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#F1F5F9' }}>Generando PDF</span>
        </div>
        <PdfProgressBar
          genId={genId}
          onComplete={undefined /* PDF download is handled by POST response */}
          onError={(err) => {
            // SSE reported an error — update the toast
            if (toastIdRef.current && !abortedRef.current) {
              abortedRef.current = true;
              toast.error('Error al generar PDF', {
                id: toastIdRef.current,
                description: err,
                duration: 8000,
              });
            }
          }}
        />
      </div>,
      {
        duration: Infinity, // Don't auto-dismiss — we control dismissal
        style: { padding: '20px' },
      },
    );

    try {
      // Read branding from localStorage
      let branding: Record<string, string> = {};
      if (typeof window !== 'undefined') {
        try {
          const stored = localStorage.getItem('agencyBranding');
          if (stored) {
            const parsed = JSON.parse(stored);
            branding = { agencyName: parsed.name || '', primaryColor: parsed.color || '', logoUrl: parsed.logoUrl || '' };
          }
        } catch {}
      }

      const res = await fetch('/api/reports/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          genId,
          investigationId: investigationId || undefined,
          branding: Object.keys(branding).length > 0 ? branding : undefined,
        }),
      });

      if (abortedRef.current) return; // Already handled by SSE error

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const filename = `SCAUDIT_Report_${projectId.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.pdf`;

      // Trigger browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Update the loading toast to success
      if (toastIdRef.current) {
        toast.success('PDF descargado correctamente', {
          id: toastIdRef.current,
          description: `${filename} — ${(blob.size / 1024).toFixed(0)} KB`,
          duration: 5000,
        });
      }
    } catch (err: unknown) {
      if (!abortedRef.current && toastIdRef.current) {
        toast.error('Error al generar PDF', {
          id: toastIdRef.current,
          description: err instanceof Error ? err.message : 'Error desconocido. Intenta de nuevo.',
          duration: 8000,
        });
      }
    } finally {
      setLoading(false);
      toastIdRef.current = null;
      genIdRef.current = null;
    }
  }, [projectId, investigationId]);

  const sizeClasses = size === 'sm' ? 'text-[10px] px-3 py-2 rounded-lg' : 'text-xs px-5 py-3 rounded-xl';
  const variantClasses = variant === 'ghost'
    ? 'bg-muted/5 border-border text-muted-fg hover:text-foreground hover:border-primary/30'
    : 'bg-primary/15 border-primary/30 text-primary hover:bg-primary/20 hover:border-primary/50';

  return (
    <button
      onClick={handleDownload}
      disabled={!projectId || loading}
      className={`inline-flex items-center gap-2 font-extrabold uppercase tracking-wider border transition-[border-color,opacity] duration-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses} ${variantClasses}`}
    >
      {loading ? (
        <><Loader2 className="w-4 h-4 animate-spin" /> {label}</>
      ) : (
        <><FileText className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} /> {label}</>
      )}
    </button>
  );
}
