'use client';

import { useState, useCallback } from 'react';
import { parseMarkdownReport, generateHtmlReportDocument } from './report-utils';

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

const PROGRESS_STEPS = [
  { progress: 15, text: 'Conectando con base de datos PostgreSQL de StrategicAudit Pro...' },
  { progress: 35, text: 'Leyendo métricas históricas de GSC (clicks, impresiones y CTR)...' },
  { progress: 55, text: 'Consolidando métricas de analítica de GA4 y conversiones...' },
  { progress: 75, text: 'Procesando resultados de la última auditoría de velocidad...' },
  { progress: 90, text: 'Google Gemini 1.5/2.5 Flash redactando el reporte en español...' },
  { progress: 98, text: 'Estructurando informe final de marca blanca en Markdown...' },
] as const;

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

    setState(s => ({ ...s, isGenerating: true, progress: 5, status: 'Inicializando motor de inteligencia artificial...', text: '' }));

    let stepIdx = 0;
    const interval = setInterval(() => {
      if (stepIdx < PROGRESS_STEPS.length) {
        const step = PROGRESS_STEPS[stepIdx];
        setState(s => ({ ...s, progress: step.progress, status: step.text }));
        stepIdx++;
      }
    }, 1800);

    try {
      const response = await fetch('/api/ai/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await response.json();
      clearInterval(interval);

      if (data.success) {
        setState(s => ({
          ...s,
          progress: 100,
          status: '¡Informe ejecutivo generado con éxito!',
          text: data.report,
          isFallback: !!data.isFallback,
          isGenerating: false,
        }));
      } else {
        clearInterval(interval);
        setState(s => ({ ...s, progress: 0, status: 'Error al procesar el informe.', isFallback: false, isGenerating: false }));
        console.error('[AiReport] API error:', data.error);
      }
    } catch (error) {
      clearInterval(interval);
      setState(s => ({ ...s, progress: 0, status: 'Error de conexión.', isGenerating: false }));
      console.error('[AiReport] Network error:', error);
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
