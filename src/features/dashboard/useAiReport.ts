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

// Timeout global del fetch: alineado con maxDuration=120s del route. El router
// IA prueba hasta 3 modelos de 20s (cadena acotada en ai-router) + queries DB,
// así que 110s da margen para recibir el reporte resiliente sin cortar antes.
// 125s > maxDuration=120s del route: el cliente debe aguantar hasta que el
// servidor responda (éxito o fallback resiliente) sin cortar antes.
const FETCH_TIMEOUT_MS = 125_000;

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

    try {
      const response = await fetch('/api/ai/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
        signal: controller.signal,
      });

      const data = await response.json().catch(() => ({}));
      clearTimeout(timeoutId);
      clearInterval(interval);

      if (!response.ok) {
        const msg = data.error || `El servidor respondió con estado ${response.status}.`;
        setState(s => ({ ...s, progress: 0, status: msg, isFallback: false, isGenerating: false }));
        logger.error(`[AiReport] HTTP error: ${response.status} - ${msg}`);
        return;
      }

      if (data.success && data.report) {
        setState(s => ({
          ...s,
          progress: 100,
          status: '¡Informe ejecutivo generado con éxito!',
          text: data.report,
          isFallback: !!data.isFallback,
          isGenerating: false,
        }));
      } else if (data.success && !data.report) {
        // El backend dice success pero no envió contenido — nunca mostrar 100% vacío.
        setState(s => ({ ...s, progress: 0, status: 'El informe llegó vacío. Reintentá en unos segundos.', isFallback: false, isGenerating: false }));
        logger.error('[AiReport] Empty report:', data);
      } else {
        setState(s => ({ ...s, progress: 0, status: data.error || 'Error al procesar el informe.', isFallback: false, isGenerating: false }));
        logger.error('[AiReport] API error:', data.error);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      clearInterval(interval);
      const timedOut = error instanceof DOMException && error.name === 'AbortError';
      setState(s => ({ ...s, progress: 0, status: timedOut ? 'El servidor tardó demasiado. Reintentá en unos segundos.' : 'Error de conexión.', isGenerating: false }));
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
