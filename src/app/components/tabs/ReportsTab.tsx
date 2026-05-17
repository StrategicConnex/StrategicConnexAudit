import React from 'react';
import { 
  FileText, Download, BarChart3, Sparkles, RefreshCw, 
  Check, Copy, AlertCircle, Activity, CheckCircle2, ChevronRight 
} from 'lucide-react';
import { parseMarkdownReport } from '../report-utils';

interface ReportsTabProps {
  initialProjects: any[];
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
  aiReport: any;
  viewMode: 'visual' | 'markdown';
  setViewMode: (mode: 'visual' | 'markdown') => void;
  setActiveTab: (tab: string) => void;
}

export function ReportsTab({ 
  initialProjects, selectedProjectId, setSelectedProjectId, 
  aiReport, viewMode, setViewMode, setActiveTab 
}: ReportsTabProps) {
  return (
    <div className="space-y-12 relative z-10 font-sans text-zinc-100">
      {/* Reports overview text */}
      <div>
        <h2 className="text-[28px] font-extrabold text-white tracking-tight">Exportación e Inteligencia IA</h2>
        <p className="text-zinc-500 text-sm mt-1">Exportación de datos de grado editorial y plantillas de reportes corporativos.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Card 1 */}
        <div className="backdrop-blur-xl border border-white/[0.06] bg-white/[0.01] rounded-2xl p-10 flex flex-col justify-between gap-10 group hover:border-cyan-500/20 transition-all shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
          <div className="flex flex-col gap-6">
            <div className="w-14 h-14 rounded-xl bg-white/[0.02] flex items-center justify-center text-zinc-500 group-hover:text-cyan-400 group-hover:bg-cyan-500/10 group-hover:border-cyan-500/20 transition-colors border border-white/[0.08]">
              <FileText className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h4 className="font-extrabold text-white text-[19px] tracking-tight">Auditoría SEO Completa (PDF)</h4>
              <p className="text-[13px] leading-relaxed text-zinc-500">Informe ejecutivo premium con visualizaciones detalladas de auditoría técnica, rendimiento de enlaces y estrategias recomendadas.</p>
            </div>
          </div>
          <button 
            onClick={() => setActiveTab('overview')}
            className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-white/[0.02] border border-white/[0.08] hover:border-cyan-500/30 text-white rounded-xl hover:bg-white/[0.04] transition-all text-[11px] font-bold uppercase tracking-widest cursor-pointer"
          >
            <Download className="w-4 h-4" /> Ir a Proyectos
          </button>
        </div>

        {/* Card 2 */}
        <div className="backdrop-blur-xl border border-white/[0.06] bg-white/[0.01] rounded-2xl p-10 flex flex-col justify-between gap-10 group hover:border-emerald-500/20 transition-all shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
          <div className="flex flex-col gap-6">
            <div className="w-14 h-14 rounded-xl bg-white/[0.02] flex items-center justify-center text-zinc-500 group-hover:text-emerald-400 group-hover:bg-emerald-500/10 group-hover:border-emerald-500/20 transition-colors border border-white/[0.08]">
              <BarChart3 className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h4 className="font-extrabold text-white text-[19px] tracking-tight">Keywords & Rankings (CSV)</h4>
              <p className="text-[13px] leading-relaxed text-zinc-500">Conjunto completo de datos que presenta palabras clave indexadas, volúmenes de búsqueda mensuales, tendencias y páginas de destino.</p>
            </div>
          </div>
          <button 
            onClick={() => alert("CSV Export estará disponible en la Fase 2 de optimizaciones.")}
            className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-white/[0.01] border border-white/[0.04] text-zinc-600 rounded-xl cursor-not-allowed text-[11px] font-bold uppercase tracking-widest"
            disabled
          >
            <Download className="w-4 h-4" /> Próximamente
          </button>
        </div>

        {/* Card 3: AI Intelligence Card */}
        <div className="backdrop-blur-xl border border-white/[0.06] bg-white/[0.01] rounded-2xl p-10 relative overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.5)] md:col-span-1">
          <div className="absolute -top-12 -left-12 w-48 h-48 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex flex-col gap-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[9px] uppercase font-bold text-cyan-400 tracking-widest w-fit">
              <Sparkles className="w-3 h-3 text-cyan-400" /> IA Premium
            </div>
            <h4 className="font-extrabold text-white text-[19px] tracking-tight">Informes Ejecutivos IA</h4>
            <p className="text-[13px] leading-relaxed text-zinc-500">Genere instantáneamente un análisis de propuesta estratégica profunda estructurada con Gemini LLM a nivel corporativo.</p>
          </div>
        </div>
      </div>

      {/* AI Section */}
      <div className="backdrop-blur-xl border border-white/[0.06] bg-white/[0.01] rounded-2xl p-10 relative overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-10 border-b border-white/[0.06] pb-10 mb-10 relative z-10">
          <div className="space-y-3">
            <h3 className="font-extrabold text-white text-2xl tracking-tight">Informes Ejecutivos mediante IA</h3>
            <p className="text-sm text-zinc-500 leading-relaxed max-w-xl">
              Combine métricas reales de Google Search Console, Lighthouse Core Web Vitals y auditorías técnicas profundas con modelos de lenguaje masivo avanzados para generar propuestas de optimización al instante.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-end gap-6 w-full md:w-auto">
            <div className="flex flex-col gap-2 w-full sm:w-auto min-w-[200px]">
              <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Seleccionar Proyecto</label>
              <div className="relative">
                <select 
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  disabled={aiReport.state.isGenerating}
                  className="w-full bg-black/60 border border-white/[0.08] focus:border-cyan-500 rounded-xl px-5 py-3.5 text-sm text-zinc-200 font-bold outline-none focus:shadow-[0_0_15px_rgba(6,182,212,0.15)] transition-all appearance-none cursor-pointer pr-10"
                >
                  <option value="" className="bg-zinc-950 text-zinc-400">Seleccionar...</option>
                  {initialProjects.map((proj) => (
                    <option key={proj.id} value={proj.id} className="bg-zinc-950 text-white">{proj.name}</option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                  ▼
                </div>
              </div>
            </div>

            <button
              onClick={aiReport.generate}
              disabled={aiReport.state.isGenerating || !selectedProjectId}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-3.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black text-[11px] font-extrabold uppercase tracking-widest shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_25px_rgba(6,182,212,0.45)] transition-all disabled:opacity-50 disabled:cursor-not-allowed group cursor-pointer"
            >
              {aiReport.state.isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Generando...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-black group-hover:scale-110 transition-transform" />
                  Generar con IA
                </>
              )}
            </button>
          </div>
        </div>

        {/* Generated Content */}
        {aiReport.state.isGenerating && (
          <div className="p-12 flex flex-col items-center justify-center text-center gap-6 border border-dashed border-cyan-500/20 rounded-2xl bg-white/[0.005]">
            <div className="relative">
              <div className="w-20 h-20 rounded-full border-4 border-white/[0.04] border-t-cyan-500 animate-spin" />
              <Sparkles className="w-8 h-8 text-cyan-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <div className="space-y-2">
              <h4 className="font-extrabold text-lg text-white tracking-tight">{aiReport.state.progress}% completado</h4>
              <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest animate-pulse">{aiReport.state.status}</p>
            </div>
          </div>
        )}

        {!aiReport.state.isGenerating && aiReport.state.text && (
          <div className="backdrop-blur-xl border border-white/[0.06] bg-black/40 rounded-2xl overflow-hidden shadow-inner">
            <div className="px-8 py-4 border-b border-white/[0.06] bg-white/[0.005] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
              <div className="bg-white/[0.02] border border-white/[0.08] p-1 rounded-xl flex gap-1">
                <button
                  onClick={() => setViewMode('visual')}
                  className={`px-5 py-2 text-[10px] font-extrabold uppercase tracking-widest rounded-lg transition-all cursor-pointer ${
                    viewMode === 'visual' ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/10' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  Vista Visual
                </button>
                <button
                  onClick={() => setViewMode('markdown')}
                  className={`px-5 py-2 text-[10px] font-extrabold uppercase tracking-widest rounded-lg transition-all cursor-pointer ${
                    viewMode === 'markdown' ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/10' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  Markdown Raw
                </button>
              </div>
              
              <div className="flex items-center gap-3">
                <button onClick={aiReport.copyToClipboard} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.08] hover:border-white/[0.15] text-[10px] font-bold uppercase tracking-widest text-zinc-300 hover:text-white cursor-pointer">
                  {aiReport.state.isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {aiReport.state.isCopied ? 'Copiado' : 'Copiar'}
                </button>
                <button onClick={aiReport.downloadHtml} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500 text-black hover:bg-cyan-400 text-[10px] font-extrabold uppercase tracking-widest shadow-[0_0_15px_rgba(6,182,212,0.2)] cursor-pointer">
                  <Download className="w-3.5 h-3.5 text-black" /> Descargar HTML
                </button>
              </div>
            </div>

            <div className="p-10 overflow-y-auto max-h-[700px] bg-black/20">
              {viewMode === 'markdown' ? (
                <div className="whitespace-pre-wrap font-mono text-sm text-zinc-300 bg-black/40 border border-white/[0.04] p-6 rounded-xl">{aiReport.state.text}</div>
              ) : (
                <ReportVisualView text={aiReport.state.text} isFallback={aiReport.state.isFallback} />
              )}
            </div>
          </div>
        )}

        {!aiReport.state.isGenerating && !aiReport.state.text && (
          <div className="p-20 flex flex-col items-center justify-center text-center gap-6 border border-dashed border-white/[0.06] rounded-2xl bg-white/[0.002]">
            <Sparkles className="w-10 h-10 text-zinc-700 animate-pulse" />
            <h4 className="font-extrabold text-base text-zinc-500 tracking-tight">Motor de Generación de Informes por IA Listo</h4>
            <p className="text-xs text-zinc-600 max-w-sm">Seleccione un proyecto activo arriba y active el motor analítico para estructurar el reporte.</p>
          </div>
        )}
      </div>

      {/* Historial */}
      <div className="backdrop-blur-xl border border-white/[0.06] bg-white/[0.01] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
        <div className="p-8 border-b border-white/[0.06] bg-white/[0.005] font-extrabold text-white text-base">Historial de Reportes</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/[0.06] text-[10px] font-bold uppercase text-zinc-500 tracking-wider">
                <th className="px-8 py-5">Informe de Auditoría</th>
                <th className="px-8 py-5">Formato</th>
                <th className="px-8 py-5 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {[
                { name: 'Full Technical SEO & Performance Audit', type: 'PDF DOCUMENT', status: 'Completado' },
                { name: 'Keywords SERP Rankings Export Data', type: 'CSV SHEET', status: 'Completado' },
              ].map((log, i) => (
                <tr key={i} className="text-[13px] hover:bg-white/[0.01] transition-all">
                  <td className="px-8 py-5 font-bold text-zinc-200">{log.name}</td>
                  <td className="px-8 py-5"><span className="text-[9px] bg-white/[0.03] border border-white/[0.06] text-zinc-400 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">{log.type}</span></td>
                  <td className="px-8 py-5 text-center text-emerald-400 font-extrabold">{log.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ReportVisualView({ text, isFallback }: { text: string; isFallback?: boolean }) {
  const data = parseMarkdownReport(text);
  return (
    <div className="space-y-10 text-zinc-300 font-sans">
      {isFallback && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-6 flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-amber-400 shrink-0" />
          <div>
            <h5 className="font-extrabold text-amber-300 text-sm">Resilience Mode Active</h5>
            <p className="text-xs text-amber-400/80 mt-0.5">El servicio principal de IA no respondió. Se ha generado un análisis estratégico local basado en heurísticas estáticas.</p>
          </div>
        </div>
      )}
      <div className="backdrop-blur-xl border border-white/[0.06] bg-white/[0.005] rounded-2xl p-10 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[4px] h-full bg-cyan-500" />
        <span className="text-[9px] font-bold uppercase tracking-widest text-cyan-400">Auditoría Ejecutiva por IA Pro</span>
        <h3 className="text-3xl font-extrabold text-white mt-3 tracking-tight">Executive SEO Strategy Report</h3>
        <p className="text-sm text-zinc-500 mt-2">Dominio Evaluado: <strong className="text-zinc-300 font-bold">{data.title}</strong></p>
      </div>

      <div className="p-8 bg-white/[0.005] border border-white/[0.06] rounded-2xl">
        <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Resumen Ejecutivo</h4>
        <p className="text-sm leading-relaxed whitespace-pre-line text-zinc-300 font-medium">{data.summary}</p>
      </div>

      <div className="space-y-6">
        <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Diagnóstico y Desglose de Rendimiento</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-black/40 p-8 border border-white/[0.06] rounded-2xl flex flex-col items-center justify-center gap-4">
            <div className="w-24 h-24 rounded-full border-4 border-zinc-800 flex items-center justify-center font-extrabold text-3xl text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.15)] bg-cyan-500/5 border-t-cyan-500">{data.healthScore}</div>
            <span className="text-[10px] font-bold text-zinc-400 mt-1 block uppercase tracking-widest">{data.healthClassification}</span>
          </div>
          <div className="md:col-span-2 space-y-3">
            {data.tableRows.slice(0, 4).map((row, idx) => (
              <div key={idx} className="flex justify-between items-center bg-white/[0.005] p-4 rounded-xl border border-white/[0.06] hover:border-cyan-500/20 transition-all">
                <span className="text-[12px] font-bold text-zinc-400 uppercase tracking-wider">{row.metric}</span>
                <span className="text-[13px] font-extrabold text-zinc-100">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
