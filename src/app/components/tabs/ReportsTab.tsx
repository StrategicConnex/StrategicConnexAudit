import React from 'react';
import { 
  FileText, Download, BarChart3, Sparkles, RefreshCw, 
  Check, Copy, AlertCircle, Activity, CheckCircle2 
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
    <div className="space-y-12">
      {/* Reports overview text */}
      <div>
        <h2 className="text-[28px] font-bold text-apple-ink tracking-tight">Export & Intelligence</h2>
        <p className="text-[15px] text-apple-ink/40 mt-1">Premium data export and white-label report templates.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Card 1 */}
        <div className="glass-card rounded-apple-md p-10 flex flex-col justify-between gap-10 group hover:border-apple-blue/20 transition-all shadow-sm">
          <div className="flex flex-col gap-6">
            <div className="w-14 h-14 rounded-apple-pill bg-apple-gray flex items-center justify-center text-apple-ink/40 group-hover:text-apple-blue transition-colors border border-apple-gray-dark/5">
              <FileText className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h4 className="font-bold text-apple-ink text-[19px] tracking-tight">Full SEO Audit (PDF)</h4>
              <p className="text-[13px] leading-relaxed text-apple-ink/40">Editorial-grade executive report with detailed visualizations, technical audits, and strategic recommendations.</p>
            </div>
          </div>
          <button 
            onClick={() => setActiveTab('overview')}
            className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-apple-gray/50 border border-apple-gray-dark/10 text-apple-ink rounded-apple-pill hover:bg-apple-gray/80 hover:shadow-md transition-all text-[11px] font-bold uppercase tracking-widest"
          >
            <Download className="w-4 h-4" /> Go to Projects
          </button>
        </div>

        {/* Card 2 */}
        <div className="glass-card rounded-apple-md p-10 flex flex-col justify-between gap-10 group hover:border-green-500/20 transition-all shadow-sm">
          <div className="flex flex-col gap-6">
            <div className="w-14 h-14 rounded-apple-pill bg-apple-gray flex items-center justify-center text-apple-ink/40 group-hover:text-green-600 transition-colors border border-apple-gray-dark/5">
              <BarChart3 className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h4 className="font-bold text-apple-ink text-[19px] tracking-tight">Keywords & Rankings (CSV)</h4>
              <p className="text-[13px] leading-relaxed text-apple-ink/40">Raw dataset featuring indexed keywords, search volumes, ranking changes, and destination landing pages.</p>
            </div>
          </div>
          <button 
            onClick={() => alert("CSV Export will be available in Phase 2.")}
            className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-apple-gray/50 border border-apple-gray-dark/10 text-apple-ink/30 rounded-apple-pill cursor-not-allowed text-[11px] font-bold uppercase tracking-widest"
            disabled
          >
            <Download className="w-4 h-4" /> Coming Soon
          </button>
        </div>

        {/* Card 3: AI Intelligence Card */}
        <div className="glass-card rounded-apple-md p-10 relative overflow-hidden shadow-sm md:col-span-1">
          <div className="absolute -top-12 -left-12 w-48 h-48 bg-apple-blue/5 rounded-apple-pill blur-3xl pointer-events-none" />
          <div className="flex flex-col gap-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-apple-pill bg-apple-blue/10 border border-apple-blue/20 text-[10px] uppercase font-bold text-apple-blue tracking-widest w-fit">
              <Sparkles className="w-3.5 h-3.5 text-apple-blue" /> IA Premium
            </div>
            <h4 className="font-bold text-apple-ink text-[19px] tracking-tight">AI Executive Reports</h4>
            <p className="text-[13px] leading-relaxed text-apple-ink/40">Genera instantaneamente una propuesta estrategica detallada con Gemini.</p>
          </div>
        </div>
      </div>

      {/* AI Section */}
      <div className="glass-card rounded-apple-md p-10 relative overflow-hidden shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-10 border-b border-apple-gray-dark/5 pb-10 mb-10 relative z-10">
          <div className="space-y-4">
            <h3 className="font-bold text-apple-ink text-2xl tracking-tight">Generador de Informes Ejecutivos por IA</h3>
            <p className="text-[15px] text-apple-ink/40 leading-relaxed max-w-xl">
              Combina datos reales de GSC, GA4 y auditorias con inteligencia artificial.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-end gap-6">
            <div className="flex flex-col gap-2 w-full sm:w-auto">
              <label className="text-[10px] text-apple-ink/40 font-bold uppercase tracking-[0.2em]">Seleccionar Proyecto</label>
              <select 
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                disabled={aiReport.state.isGenerating}
                className="bg-apple-gray/50 border border-apple-gray-dark/10 rounded-apple-pill px-6 py-3 text-[13px] text-apple-ink font-medium outline-none focus:border-apple-blue transition-all appearance-none cursor-pointer pr-10 bg-no-repeat"
                style={{
                  backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%231d1d1f%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E")`,
                  backgroundPosition: 'right 1.5rem center',
                  backgroundSize: '16px'
                }}
              >
                <option value="">Seleccionar...</option>
                {initialProjects.map((proj) => (
                  <option key={proj.id} value={proj.id}>{proj.name}</option>
                ))}
              </select>
            </div>

            <button
              onClick={aiReport.generate}
              disabled={aiReport.state.isGenerating || !selectedProjectId}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 rounded-apple-pill bg-apple-ink text-white text-[11px] font-bold uppercase tracking-widest shadow-xl shadow-apple-ink/10 hover:bg-apple-blue hover:shadow-apple-blue/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              {aiReport.state.isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Generando...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-white/80 group-hover:scale-110 transition-transform" />
                  Generar con IA
                </>
              )}
            </button>
          </div>
        </div>

        {/* Generated Content */}
        {aiReport.state.isGenerating && (
          <div className="p-12 flex flex-col items-center justify-center text-center gap-6 border border-dashed border-apple-blue/20 rounded-apple-md bg-apple-gray/50">
            <div className="relative">
              <div className="w-20 h-20 rounded-apple-pill border-4 border-apple-gray border-t-apple-blue animate-spin" />
              <Sparkles className="w-8 h-8 text-apple-blue absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <div className="space-y-2">
              <h4 className="font-bold text-lg text-apple-ink tracking-tight">{aiReport.state.progress}% completado</h4>
              <p className="text-[11px] font-medium text-apple-ink/40 uppercase tracking-widest animate-pulse">{aiReport.state.status}</p>
            </div>
          </div>
        )}

        {!aiReport.state.isGenerating && aiReport.state.text && (
          <div className="glass-card rounded-apple-md overflow-hidden shadow-sm">
            <div className="px-8 py-4 border-b border-apple-gray-dark/5 bg-apple-gray/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
              <div className="bg-apple-gray border border-apple-gray-dark/10 p-1 rounded-apple-pill flex">
                <button
                  onClick={() => setViewMode('visual')}
                  className={`px-5 py-2 text-[10px] font-bold uppercase tracking-widest rounded-apple-pill transition-all ${
                    viewMode === 'visual' ? 'bg-apple-gray-dark text-apple-ink shadow-sm' : 'text-apple-ink/40'
                  }`}
                >
                  Visual
                </button>
                <button
                  onClick={() => setViewMode('markdown')}
                  className={`px-5 py-2 text-[10px] font-bold uppercase tracking-widest rounded-apple-pill transition-all ${
                    viewMode === 'markdown' ? 'bg-apple-gray-dark text-apple-ink shadow-sm' : 'text-apple-ink/40'
                  }`}
                >
                  Markdown
                </button>
              </div>
              
              <div className="flex items-center gap-3">
                <button onClick={aiReport.copyToClipboard} className="inline-flex items-center gap-2 px-4 py-2 rounded-apple-pill bg-apple-white border border-apple-gray-dark/10 text-[10px] font-bold uppercase tracking-widest">
                  {aiReport.state.isCopied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {aiReport.state.isCopied ? 'Copied' : 'Copy'}
                </button>
                <button onClick={aiReport.downloadHtml} className="inline-flex items-center gap-2 px-4 py-2 rounded-apple-pill bg-apple-ink text-white text-[10px] font-bold uppercase tracking-widest">
                  <Download className="w-3.5 h-3.5" /> HTML
                </button>
              </div>
            </div>

            <div className="p-10 overflow-y-auto max-h-[700px]">
              {viewMode === 'markdown' ? (
                <div className="whitespace-pre-wrap font-mono text-sm">{aiReport.state.text}</div>
              ) : (
                <ReportVisualView text={aiReport.state.text} isFallback={aiReport.state.isFallback} />
              )}
            </div>
          </div>
        )}

        {!aiReport.state.isGenerating && !aiReport.state.text && (
          <div className="p-20 flex flex-col items-center justify-center text-center gap-6 border border-dashed border-apple-gray-dark/10 rounded-apple-md bg-apple-gray/30">
            <Sparkles className="w-10 h-10 text-apple-ink/10" />
            <h4 className="font-bold text-lg text-apple-ink tracking-tight">Motor de Estrategia IA Listo</h4>
          </div>
        )}
      </div>

      {/* Historial */}
      <div className="glass-card rounded-apple-md overflow-hidden shadow-sm">
        <div className="p-8 border-b border-apple-gray-dark/5 bg-apple-gray/10 font-bold text-apple-ink text-[15px]">Historial de Reportes</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-apple-gray-dark/5 text-[10px] font-bold uppercase text-apple-ink/30 tracking-widest">
                <th className="px-8 py-5">Reporte</th>
                <th className="px-8 py-5">Formato</th>
                <th className="px-8 py-5 text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: 'Full Technical Audit', type: 'PDF', status: 'Completado' },
                { name: 'Keywords SERP Export', type: 'CSV', status: 'Completado' },
              ].map((log, i) => (
                <tr key={i} className="border-b border-apple-gray-dark/5 text-[13px] hover:bg-apple-gray/10">
                  <td className="px-8 py-5 font-bold">{log.name}</td>
                  <td className="px-8 py-5"><span className="text-[10px] bg-apple-gray px-2 py-0.5 rounded-apple-pill">{log.type}</span></td>
                  <td className="px-8 py-5 text-center text-green-600 font-bold">{log.status}</td>
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
    <div className="space-y-10">
      {isFallback && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-apple-md p-6 flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-amber-600" />
          <p className="text-[13px] text-amber-900/70">Resilience Mode Active: Analysis generated with local algorithms.</p>
        </div>
      )}
      <div className="bg-apple-gray border border-apple-gray-dark/5 rounded-apple-md p-10">
        <span className="text-[10px] font-bold uppercase tracking-widest text-apple-ink/40">Audited by StrategicAudit Pro</span>
        <h3 className="text-3xl font-bold text-apple-ink mt-3 tracking-tight">Executive SEO Audit Report</h3>
        <p className="text-[15px] text-apple-ink/40 mt-2">Domain: <strong className="text-apple-ink">{data.title}</strong></p>
      </div>

      <div className="p-8 bg-apple-gray/20 border border-apple-gray-dark/5 rounded-apple-md">
        <h4 className="text-[11px] font-bold text-apple-ink/40 uppercase tracking-widest mb-4">Executive Summary</h4>
        <p className="text-[15px] leading-relaxed whitespace-pre-line">{data.summary}</p>
      </div>

      <div className="space-y-6">
        <h4 className="text-[11px] font-bold text-apple-ink/40 uppercase tracking-widest">Diagnostics & Performance</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-apple-white p-8 border border-apple-gray-dark/5 rounded-apple-md text-center">
            <div className="w-20 h-20 mx-auto rounded-apple-pill border-4 border-apple-gray flex items-center justify-center font-bold text-2xl text-apple-blue">{data.healthScore}</div>
            <span className="text-[10px] font-bold text-apple-ink/40 mt-4 block uppercase tracking-widest">{data.healthClassification}</span>
          </div>
          <div className="md:col-span-2 space-y-4">
            {data.tableRows.slice(0, 4).map((row, idx) => (
              <div key={idx} className="flex justify-between items-center bg-apple-white p-4 rounded-apple-md border border-apple-gray-dark/5">
                <span className="text-[12px] font-medium text-apple-ink/60">{row.metric}</span>
                <span className="text-[12px] font-bold">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
