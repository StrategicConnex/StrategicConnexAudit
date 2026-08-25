import React from 'react';
import { 
  FileText, Download, BarChart3, Sparkles, RefreshCw, 
  Check, Copy, AlertCircle 
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DownloadPdfButton } from '@/features/dashboard/DownloadPdfButton';
import { parseMarkdownReport, extractMermaidBlocks, tableRowsToChartData } from '../report-utils';
import { MermaidBlock } from '@/features/dashboard/MermaidBlock';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { ProjectRow } from '@/shared/db/types';

interface AIReportState {
  isGenerating: boolean;
  isCopied: boolean;
  text: string;
  isFallback: boolean;
  progress: number;
  status: string;
}

interface AIReport {
  state: AIReportState;
  generate: () => void;
  copyToClipboard: () => void;
  downloadHtml: () => void;
}

interface ReportsTabProps {
  initialProjects: ProjectRow[];
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
  aiReport: AIReport;
  viewMode: 'visual' | 'markdown';
  setViewMode: (mode: 'visual' | 'markdown') => void;
  setActiveTab: (tab: string) => void;
}

export function ReportsTab({ 
  initialProjects, selectedProjectId, setSelectedProjectId, 
  aiReport, viewMode, setViewMode 
}: ReportsTabProps) {
  const t = useTranslations('reports');
  return (
    <div className="space-y-12 relative z-10 font-sans text-foreground">
      {/* Reports overview text */}
      <div>
        <h2 className="text-2xl font-extrabold text-white tracking-tight">{t('pageTitle')}</h2>
        <p className="text-muted-fg text-sm mt-1">{t('pageSubtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Card 1 */}
        <div className="glass-card p-10 flex flex-col justify-between gap-10 group hover:border-primary/20 transition-colors ">
          <div className="flex flex-col gap-6">
            <div className="w-14 h-14 rounded-xl bg-muted/10 flex items-center justify-center text-muted-fg group-hover:text-primary group-hover:bg-primary/10 group-hover:border-primary/20 transition-colors border border-border">
              <FileText className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h4 className="font-extrabold text-white text-lg tracking-tight">{t('pdfCardTitle')}</h4>
              <p className="text-sm leading-relaxed text-muted-fg">{t('pdfCardDesc')}</p>
            </div>
          </div>
          <DownloadPdfButton
            projectId={selectedProjectId}
            label={t('downloadPdf')}
            size="md"
          />
        </div>

        {/* Card 2 */}
        <div className="glass-card p-10 flex flex-col justify-between gap-10 group hover:border-chartreuse/20 transition-colors ">
          <div className="flex flex-col gap-6">
            <div className="w-14 h-14 rounded-xl bg-muted/10 flex items-center justify-center text-muted-fg group-hover:text-chartreuse group-hover:bg-chartreuse/10 group-hover:border-chartreuse/20 transition-colors border border-border">
              <BarChart3 className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h4 className="font-extrabold text-white text-lg tracking-tight">{t('csvCardTitle')}</h4>
              <p className="text-sm leading-relaxed text-muted-fg">{t('csvCardDesc')}</p>
            </div>
          </div>
          <button 
            onClick={async () => {
              if (!selectedProjectId) {
                alert(t('csvSelectProject'));
                return;
              }
              try {
                // Dynamically import the action so we don't break Server/Client boundaries if this is imported loosely
                const { exportKeywordsCSV } = await import('@/app/actions/reports');
                const result = await exportKeywordsCSV({ projectId: selectedProjectId });
                if (result.data && result.data.success && result.data.csv) {
                  const blob = new Blob([result.data.csv], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = result.data.filename || "keywords_export.csv";
                  link.style.display = 'none';
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  URL.revokeObjectURL(url);
                } else if (result.error) {
                  alert(result.error);
                }
              } catch (e) {
                console.error(e);
                alert(t('csvError'));
              }
            }}
            className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-chartreuse/10 border border-chartreuse/20 hover:border-chartreuse/40 text-chartreuse rounded-xl hover:bg-chartreuse/20 transition-[color,background-color,border-color,box-shadow] text-2xs font-bold uppercase tracking-widest cursor-pointer shadow-[0_0_15px_rgba(140,200,80,0.1)] hover:shadow-[0_0_20px_rgba(140,200,80,0.2)]"
          >
            <Download className="w-4 h-4" /> {t('downloadCsv')}
          </button>
        </div>

        {/* Card 3: AI Intelligence Card */}
        <div className="glass-card p-10 relative overflow-hidden  md:col-span-1">
          <div className="absolute -top-12 -left-12 w-48 h-48 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex flex-col gap-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-2xs uppercase font-bold text-primary tracking-widest w-fit">
              <Sparkles className="w-3 h-3 text-primary" /> {t('aiBadge')}
            </div>
            <h4 className="font-extrabold text-white text-lg tracking-tight">{t('aiCardTitle')}</h4>
            <p className="text-sm leading-relaxed text-muted-fg">{t('aiCardDesc')}</p>
          </div>
        </div>
      </div>

      {/* AI Section */}
      <div className="glass-card p-10 relative overflow-hidden ">
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-10 border-b border-border pb-10 mb-10 relative z-10">
          <div className="space-y-3">
            <h3 className="font-extrabold text-white text-2xl tracking-tight">{t('aiSectionTitle')}</h3>
            <p className="text-sm text-muted-fg leading-relaxed max-w-xl">
              {t('aiSectionDesc')}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-end gap-6 w-full md:w-auto">
            <div className="flex flex-col gap-2 w-full sm:w-auto min-w-[200px]">
              <label className="text-2xs text-muted-fg font-bold uppercase tracking-widest">{t('selectProject')}</label>
              <div className="relative">
                <select 
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  disabled={aiReport.state.isGenerating}
                  className="w-full bg-card border border-border focus:border-primary rounded-xl px-5 py-3.5 text-sm text-foreground/80 font-bold outline-none focus:shadow-[0_0_15px_rgba(98,113,196,0.15)] transition-[color,background-color,border-color,box-shadow] appearance-none cursor-pointer pr-10"
                >
                  <option value="" className="bg-card text-muted-fg">{t('selectPlaceholder')}</option>
                  {initialProjects.map((proj) => (
                    <option key={proj.id} value={proj.id} className="bg-card text-white">{proj.name}</option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted-fg">
                  ▼
                </div>
              </div>
            </div>

            <button
              onClick={aiReport.generate}
              disabled={aiReport.state.isGenerating || !selectedProjectId}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-3.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-2xs font-extrabold uppercase tracking-widest shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_25px_rgba(99,102,241,0.45)] transition-[color,background-color,opacity,box-shadow] disabled:opacity-50 disabled:cursor-not-allowed group cursor-pointer"
            >
              {aiReport.state.isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  {t('generating')}
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-primary-foreground group-hover:scale-110 transition-transform" />
                  {t('generateAi')}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Generated Content */}
        {aiReport.state.isGenerating && (
          <div className="p-12 flex flex-col items-center justify-center text-center gap-6 border border-dashed border-primary/20 rounded-2xl bg-muted/1">
            <div className="relative">
              <div className="w-20 h-20 rounded-full border-4 border-border/50 border-t-cyan-500 animate-spin" />
              <Sparkles className="w-8 h-8 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <div className="space-y-2">
              <h4 className="font-extrabold text-lg text-white tracking-tight">{t('progressPercent', { percent: aiReport.state.progress })}</h4>
              <p className="text-2xs font-bold text-primary uppercase tracking-widest animate-pulse">{aiReport.state.status}</p>
            </div>
          </div>
        )}

        {!aiReport.state.isGenerating && aiReport.state.text && (
          <div className="backdrop-blur-xl border border-border bg-card rounded-2xl overflow-hidden shadow-inner">
            <div className="px-8 py-4 border-b border-border bg-muted/1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
              <div className="bg-muted/10 border border-border p-1 rounded-xl flex gap-1">
                <button
                  onClick={() => setViewMode('visual')}
                  className={`px-5 py-2 text-2xs font-extrabold uppercase tracking-widest rounded-lg transition-[color,background-color,box-shadow] cursor-pointer ${
                    viewMode === 'visual' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/10' : 'text-muted-fg hover:text-foreground/80'
                  }`}
                >
                  {t('visualView')}
                </button>
                <button
                  onClick={() => setViewMode('markdown')}
                  className={`px-5 py-2 text-2xs font-extrabold uppercase tracking-widest rounded-lg transition-[color,background-color,box-shadow] cursor-pointer ${
                    viewMode === 'markdown' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/10' : 'text-muted-fg hover:text-foreground/80'
                  }`}
                >
                  {t('markdownRaw')}
                </button>
              </div>
              
              <div className="flex items-center gap-3">
                <button onClick={aiReport.copyToClipboard} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-muted/10 border border-border hover:border-border/70 text-2xs font-bold uppercase tracking-widest text-foreground/80 hover:text-foreground cursor-pointer">
                  {aiReport.state.isCopied ? <Check className="w-3.5 h-3.5 text-chartreuse" /> : <Copy className="w-3.5 h-3.5" />}
                  {aiReport.state.isCopied ? t('copied') : t('copy')}
                </button>
                <button onClick={aiReport.downloadHtml} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-2xs font-extrabold uppercase tracking-widest shadow-[0_0_15px_rgba(99,102,241,0.25)] cursor-pointer">
                  <Download className="w-3.5 h-3.5 text-primary-foreground" /> {t('downloadHtml')}
                </button>
              </div>
            </div>

            <div className="p-10 overflow-y-auto max-h-[700px] bg-card">
              {viewMode === 'markdown' ? (
                <div className="whitespace-pre-wrap font-mono text-sm text-foreground/80 bg-card border border-border/50 p-6 rounded-xl">{aiReport.state.text}</div>
              ) : (
                <ReportVisualView text={aiReport.state.text} isFallback={aiReport.state.isFallback} />
              )}
            </div>
          </div>
        )}

        {!aiReport.state.isGenerating && !aiReport.state.text && (
          <div className="p-20 flex flex-col items-center justify-center text-center gap-6 border border-dashed border-border rounded-2xl bg-muted/1">
            <Sparkles className="w-10 h-10 text-muted-fg/80 animate-pulse" />
            <h4 className="font-extrabold text-base text-muted-fg tracking-tight">{t('aiReadyTitle')}</h4>
            <p className="text-xs text-muted-fg max-w-sm">{t('aiReadyDesc')}</p>
          </div>
        )}
      </div>

      {/* Historial */}
      <div className="glass-card overflow-hidden ">
        <div className="p-8 border-b border-border bg-muted/1 font-extrabold text-white text-base">{t('historyTitle')}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border text-2xs font-bold uppercase text-muted-fg tracking-wider">
                <th className="px-8 py-5">{t('historyColName')}</th>
                <th className="px-8 py-5">{t('historyColFormat')}</th>
                <th className="px-8 py-5 text-center">{t('historyColStatus')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {[
                { name: t('historyRow1Name'), type: t('historyRow1Format'), status: t('historyRow1Status') },
                { name: t('historyRow2Name'), type: t('historyRow2Format'), status: t('historyRow2Status') },
              ].map((log, i) => (
                <tr key={i} className="text-sm hover:bg-muted/5 transition-colors">
                  <td className="px-8 py-5 font-bold text-foreground/80">{log.name}</td>
                  <td className="px-8 py-5"><span className="text-2xs bg-muted/20 border border-border text-muted-fg px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">{log.type}</span></td>
                  <td className="px-8 py-5 text-center text-chartreuse font-extrabold">{log.status}</td>
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
  const t = useTranslations('reports');
  const data = parseMarkdownReport(text);
  const mermaidBlocks = extractMermaidBlocks(text);
  const chartData = tableRowsToChartData(data.tableRows);
  return (
    <div className="space-y-10 text-foreground/80 font-sans">
      {isFallback && (
        <div className="bg-[oklch(75% 0.13 80)]/10 border border-[oklch(75% 0.13 80)]/20 rounded-xl p-6 flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-[oklch(75% 0.13 80)] shrink-0" />
          <div>
            <h5 className="font-extrabold text-[oklch(75% 0.13 80)] text-sm">{t('visualResilienceTitle')}</h5>
            <p className="text-xs text-[oklch(75% 0.13 80)]/80 mt-0.5">{t('visualResilienceDesc')}</p>
          </div>
        </div>
      )}
      <div className="backdrop-blur-xl border border-border bg-muted/1 rounded-2xl p-10 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[4px] h-full bg-cyan-500" />
        <span className="text-2xs font-bold uppercase tracking-widest text-primary">{t('visualBadge')}</span>
        <h3 className="text-3xl font-extrabold text-white mt-3 tracking-tight">{t('visualReportTitle')}</h3>
        <p className="text-sm text-muted-fg mt-2">{t('visualDomainLabel')} <strong className="text-foreground/80 font-bold">{data.title}</strong></p>
      </div>

      <div className="p-8 bg-muted/1 border border-border rounded-2xl">
        <h4 className="text-2xs font-bold text-muted-fg uppercase tracking-widest mb-4">{t('visualExecSummary')}</h4>
        <p className="text-sm leading-relaxed whitespace-pre-line text-foreground/80 font-medium">{data.summary}</p>
      </div>

      <div className="space-y-6">
        <h4 className="text-2xs font-bold text-muted-fg uppercase tracking-widest">{t('visualPerformance')}</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-card p-8 border border-border rounded-2xl flex flex-col items-center justify-center gap-4">
            <div className="w-24 h-24 rounded-full border-4 border-zinc-800 flex items-center justify-center font-extrabold text-3xl text-primary shadow-[0_0_20px_rgba(6,182,212,0.15)] bg-primary/5 border-t-cyan-500">{data.healthScore}</div>
            <span className="text-2xs font-bold text-muted-fg mt-1 block uppercase tracking-widest">{data.healthClassification}</span>
          </div>
          <div className="md:col-span-2 space-y-3">
            {data.tableRows.slice(0, 4).map((row, idx) => (
              <div key={idx} className="flex justify-between items-center bg-muted/1 p-4 rounded-xl border border-border hover:border-primary/20 transition-colors">
                <span className="text-xs font-bold text-muted-fg uppercase tracking-wider">{row.metric}</span>
                <span className="text-sm font-extrabold text-foreground">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Gráfico de barras de los KPIs de rendimiento */}
      {chartData.length > 0 && (
        <div className="bg-card p-6 border border-border rounded-2xl">
          <h4 className="text-2xs font-bold text-muted-fg uppercase tracking-widest mb-4">{t('visualChartTitle')}</h4>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} interval={0} angle={-18} textAnchor="end" height={48} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{
                    background: '#0f172a', border: '1px solid #334155', borderRadius: 12,
                    fontSize: 12, color: '#e2e8f0',
                  }}
                />
                <Bar dataKey="value" fill="#22d3ee" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Diagramas mermaid generados por la IA */}
      {mermaidBlocks.length > 0 && (
        <div className="space-y-6">
          <h4 className="text-2xs font-bold text-muted-fg uppercase tracking-widest">{t('visualDiagrams')}</h4>
          {mermaidBlocks.map((block, idx) => (
            <MermaidBlock key={idx} code={block.code} id={`report-mermaid-${idx}`} />
          ))}
        </div>
      )}
    </div>
  );
}
