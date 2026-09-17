'use client';

import { useState, useCallback } from 'react';
import { parseMarkdownReport, generateHtmlReportDocument } from './report-utils';
import { logger } from "@/lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AiReportState {
  text: string;
  isGenerating: boolean;
  isFallback: boolean;
  progress: number;
  status: string;
  isCopied: boolean;
}

// ─── Steps for the animated progress bar ─────────────────────────────────────
// El último paso es 90% a propósito: 100% solo se alcanza cuando el backend
// devuelve el reporte real. Así el usuario nunca ve "completado" sin contenido.

const PROGRESS_STEPS = [
  { progress: 15, text: 'Conectando con base de datos PostgreSQL de StrategicAudit Pro...' },
  { progress: 35, text: 'Leyendo métricas históricas de GSC (clicks, impresiones y CTR)...' },
  { progress: 55, text: 'Consolidando métricas de analítica de GA4 y conversiones...' },
  { progress: 75, text: 'Procesando resultados de la última auditoría de velocidad...' },
  { progress: 90, text: 'Redactando el informe ejecutivo con el motor de IA...' },
] as const;

// Timeout global del fetch de encolado: la ruta solo crea el job (<2s).
const FETCH_TIMEOUT_MS = 20_000;

// Polling del trabajo diferido: cada 3s hasta 5 min (el task tiene hasta
// 10 min con reintentos; 5 min cubre el caso típico sin colgar la UI).
const POLL_INTERVAL_MS = 3_000;
const POLL_MAX_ATTEMPTS = 100;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAiReport(projectId: string) {
  const [state, setState] = useState<AiReportState>({
    text: '',
    isGenerating: false,
    isFallback: false,
    progress: 0,
    status: '',
    isCopied: false,
  });

  const generate = useCallback(async () => {
    if (!projectId) return;

    setState(s => ({ ...s, isGenerating: true, progress: 5, status: 'Inicializando motor de inteligencia artificial...', text: '', isFallback: false }));

    let stepIdx = 0;
    const interval = setInterval(() => {
      if (stepIdx < PROGRESS_STEPS.length) {
        const step = PROGRESS_STEPS[stepIdx]!;
        setState(s => ({ ...s, progress: step.progress, status: step.text }));
        stepIdx++;
      }
    }, 1800);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const stopFx = () => {
      clearTimeout(timeoutId);
      clearInterval(interval);
    };

    const finishWithReport = (report: string, isFallback: boolean, status: string) => {
      stopFx();
      setState(s => ({
        ...s,
        progress: 100,
        status,
        text: report,
        isFallback,
        isGenerating: false,
      }));
    };

    const failWith = (status: string) => {
      stopFx();
      setState(s => ({ ...s, progress: 0, status, isFallback: false, isGenerating: false }));
    };

    // P2-1: polling del trabajo diferido (el POST solo encola).
    const pollJob = async (jobId: string) => {
      for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        try {
          const res = await fetch(`/api/ai/report/status?jobId=${encodeURIComponent(jobId)}`);
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.success) {
            failWith(data.error || 'No se pudo consultar el estado del informe.');
            logger.error('[AiReport] Status error:', data);
            return;
          }
          if (data.status === 'completed' && data.report) {
            finishWithReport(data.report, !!data.isFallback, '¡Informe ejecutivo generado con éxito!');
            return;
          }
          if (data.status === 'failed') {
            failWith(data.error || 'La generación falló. Reintentá en unos segundos.');
            logger.error('[AiReport] Job failed:', data);
            return;
          }
          // pending/running → seguir esperando (la animación de progreso sigue).
        } catch (error) {
          logger.error('[AiReport] Poll error:', error);
        }
      }
      failWith('El informe está tardando demasiado. Reintentá en unos minutos.');
    };

    try {
      const response = await fetch('/api/ai/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
        signal: controller.signal,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const msg = data.error || `El servidor respondió con estado ${response.status}.`;
        failWith(msg);
        logger.error(`[AiReport] HTTP error: ${response.status} - ${msg}`);
        return;
      }

      if (data.success && data.report) {
        // Camino síncrono (fallback local cuando Trigger.dev no está).
        finishWithReport(data.report, !!data.isFallback, '¡Informe ejecutivo generado con éxito!');
      } else if (data.success && data.pending && data.jobId) {
        // Camino diferido — polling hasta completed/failed.
        await pollJob(data.jobId);
      } else if (data.success && !data.report) {
        // El backend dice success pero no envió contenido — nunca mostrar 100% vacío.
        failWith('El informe llegó vacío. Reintentá en unos segundos.');
        logger.error('[AiReport] Empty report:', data);
      } else {
        failWith(data.error || 'Error al procesar el informe.');
        logger.error('[AiReport] API error:', data.error);
      }
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === 'AbortError';
      failWith(timedOut ? 'El servidor tardó demasiado. Reintentá en unos segundos.' : 'Error de conexión.');
      logger.error('[AiReport] Network error:', error);
    }
  }, [projectId]);

  const copyToClipboard = useCallback(() => {
    if (!state.text) return;
    navigator.clipboard.writeText(state.text);
    setState(s => ({ ...s, isCopied: true }));
    setTimeout(() => setState(s => ({ ...s, isCopied: false })), 2000);
  }, [state.text]);

  const downloadMarkdown = useCallback(() => {
    if (!state.text) return;
    const blob = new Blob([state.text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte-ejecutivo-${projectId}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [state.text, projectId]);

  const downloadHtml = useCallback(() => {
    if (!state.text) return;
    const parsed = parseMarkdownReport(state.text);
    const htmlContent = generateHtmlReportDocument(parsed);
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte-ejecutivo-${projectId}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [state.text, projectId]);

  return { state, generate, copyToClipboard, downloadMarkdown, downloadHtml };
}
