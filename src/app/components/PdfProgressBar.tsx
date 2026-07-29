'use client';

import React, { useEffect, useState } from 'react';

interface PdfProgressBarProps {
  genId: string;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

interface ProgressState {
  percent: number;
  step: string;
  status: 'connecting' | 'working' | 'complete' | 'error';
  error?: string;
}

/**
 * PdfProgressBar — renders inside a sonner toast to show real PDF generation progress.
 * Opens an EventSource to /api/reports/pdf/progress?genId=<id> and displays
 * a progress bar with the current step description.
 */
export function PdfProgressBar({ genId, onComplete, onError }: PdfProgressBarProps) {
  const [state, setState] = useState<ProgressState>({
    percent: 0,
    step: 'Conectando...',
    status: 'connecting',
  });

  useEffect(() => {
    const source = new EventSource(`/api/reports/pdf/progress?genId=${genId}`);
    let intentionallyClosed = false;

    source.addEventListener('progress', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setState({
          percent: data.percent ?? 0,
          step: data.step ?? 'Procesando...',
          status: 'working',
        });
      } catch {}
    });

    source.addEventListener('complete', () => {
      intentionallyClosed = true;
      setState((prev) => ({
        ...prev,
        percent: 100,
        step: 'PDF listo',
        status: 'complete',
      }));
      source.close();
      onComplete?.();
    });

    source.addEventListener('error', (e: MessageEvent) => {
      intentionallyClosed = true;
      try {
        const data = JSON.parse(e.data);
        const msg = data.error || 'Error en la generaci\u00f3n';
        setState({
          percent: 0,
          step: msg,
          status: 'error',
          error: msg,
        });
        onError?.(msg);
      } catch {
        setState((prev) => ({
          ...prev,
          step: 'Error de conexi\u00f3n',
          status: 'error',
          error: 'Error de conexi\u00f3n',
        }));
        onError?.('Error de conexi\u00f3n');
      }
      source.close();
    });

    source.onerror = () => {
      if (intentionallyClosed) return; // Already handled by complete/error event listener
      setState((prev) => ({
        ...prev,
        step: 'Error de conexi\u00f3n SSE',
        status: 'error',
        error: 'No se pudo conectar con el servidor de progreso.',
      }));
      onError?.('No se pudo conectar con el servidor de progreso.');
      source.close();
    };

    return () => {
      intentionallyClosed = true;
      source.close();
    };
  }, [genId, onComplete, onError]);

  const barColor =
    state.status === 'complete' ? '#A3E635' :
    state.status === 'error' ? '#EF4444' :
    '#6366F1';

  return (
    <div className="w-full space-y-2" style={{ minWidth: 280 }}>
      <div className="flex items-center justify-between gap-3">
        <span
          style={{
            fontSize: 11,
            color: state.status === 'error' ? '#EF4444' : '#94A3B8',
            fontFamily: 'ui-monospace, monospace',
            lineHeight: 1.4,
          }}
        >
          {state.step}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: barColor,
            fontFamily: 'ui-monospace, monospace',
          }}
        >
          {state.percent}%
        </span>
      </div>

      <div
        style={{
          width: '100%',
          height: 6,
          backgroundColor: '#1E293B',
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${state.percent}%`,
            height: '100%',
            backgroundColor: barColor,
            borderRadius: 3,
            transition: 'width 0.3s ease, background-color 0.3s ease',
            boxShadow: state.status === 'working'
              ? '0 0 8px rgba(99,102,241,0.4)'
              : state.status === 'complete'
              ? '0 0 8px rgba(163,230,53,0.4)'
              : 'none',
          }}
        />
      </div>
    </div>
  );
}
