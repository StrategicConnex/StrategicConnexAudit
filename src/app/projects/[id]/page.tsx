import { db } from '@/shared/db';
import { projects, audits, crawlResults, issues, uptimeLogs, webVitalsLogs } from '@/shared/db/schemas';
import { eq, desc, sql, count, avg } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Globe, Activity, FileText, AlertTriangle, ArrowRight, Download, FileSpreadsheet } from 'lucide-react';
import Link from 'next/link';
import AuditControl from './components/AuditControl';
import DeactivateButton from './components/DeactivateButton';
import { createClient } from '@/shared/lib/supabase/server';
import { withRLS } from '@/shared/db/rls';
import { ExportCsvButton } from '@/app/components/ExportCsvButton';

export const dynamic = 'force-dynamic';

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const projectId = resolvedParams.id;
  
  // 0. Autenticar usuario
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Ejecutar todo el fetch dentro de un contexto RLS
  let data;
  try {
    data = await withRLS(user.id, async (tx) => {
      // 1. Obtener proyecto de la base de datos
      const projectResult = await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      const project = projectResult[0];
      
      if (!project) {
        return null;
      }
      
      // 2. Obtener historial de auditorías (limitado a las últimas 50 para rendimiento)
      const projectAudits = await tx.select().from(audits)
        .where(eq(audits.projectId, projectId))
        .orderBy(desc(audits.createdAt))
        .limit(50);

      // 3. Extraer la última auditoría completada con éxito para calcular métricas vivas
      const latestCompletedAudit = projectAudits.find(a => a.status === 'completed');
      
      let healthScore = "--";
      let pagesCrawled = "0";
      let criticalIssuesCount = "0";

      if (latestCompletedAudit) {
        // Optimizamos usando count() nativo de Drizzle
        const [crawlsCount] = await tx.select({ value: count() })
          .from(crawlResults)
          .where(eq(crawlResults.auditId, latestCompletedAudit.id));
        
        pagesCrawled = (crawlsCount?.value || 0).toString();

        // Contamos issues por severidad de forma eficiente
        const [issueStats] = await tx.select({
          criticalCount: count(sql`case when ${issues.severity} = 'critical' then 1 end`),
          warningCount: count(sql`case when ${issues.severity} = 'warning' then 1 end`)
        })
        .from(issues)
        .where(eq(issues.auditId, latestCompletedAudit.id));
        
        const criticals = Number(issueStats?.criticalCount || 0);
        const warnings = Number(issueStats?.warningCount || 0);
        
        criticalIssuesCount = criticals.toString();
        healthScore = Math.max(0, 100 - (criticals * 15) - (warnings * 5)).toString() + "%";
      }

      // 4. Fetch Uptime Logs (Resiliente)
      let recentUptimes: any[] = [];
      try {
        recentUptimes = await tx.select().from(uptimeLogs)
          .where(eq(uptimeLogs.projectId, projectId))
          .orderBy(desc(uptimeLogs.checkedAt))
          .limit(10);
      } catch (e) {
        console.warn("Uptime logs table not ready or accessible:", e);
      }
      
      const currentUptimeStatus = recentUptimes.length > 0 ? (recentUptimes[0].isUp ? 'up' : 'down') : 'unknown';
        
      // 5. Fetch Web Vitals Logs (Resiliente)
      let vitalsLogs: any[] = [];
      try {
        vitalsLogs = await tx.select({
          lcp: webVitalsLogs.lcp,
          cls: webVitalsLogs.cls,
          fcp: webVitalsLogs.fcp
        })
        .from(webVitalsLogs)
        .where(eq(webVitalsLogs.projectId, projectId))
        .orderBy(desc(webVitalsLogs.recordedAt))
        .limit(50);
      } catch (e) {
        console.warn("WebVitals logs table not ready or accessible:", e);
      }

      const validVitals = vitalsLogs.filter(v => v.lcp !== null);
      const vitalsAverages = {
        LCP: validVitals.length > 0 ? validVitals.reduce((acc, curr) => acc + Number(curr.lcp || 0), 0) / validVitals.length : 0,
        CLS: validVitals.length > 0 ? validVitals.reduce((acc, curr) => acc + Number(curr.cls || 0), 0) / validVitals.length : 0,
        FCP: validVitals.length > 0 ? validVitals.reduce((acc, curr) => acc + Number(curr.fcp || 0), 0) / validVitals.length : 0,
        FID: 0,
      };

      return {
        project,
        projectAudits,
        healthScore,
        pagesCrawled,
        criticalIssuesCount,
        currentUptimeStatus,
        vitalsAverages,
        latestCompletedAudit
      };
    });
  } catch (error: any) {
    console.error("Critical error loading project detail:", error);
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-10 text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Error al cargar el panel de control</h1>
        <p className="mt-2 text-muted-foreground max-w-md">
          Hubo un problema técnico al recuperar los datos de este proyecto. Nuestro equipo ha sido notificado.
        </p>
        <div className="mt-8 flex gap-4">
          <Link href="/" className="px-6 py-2 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-colors">
            Volver al Inicio
          </Link>
          <button 
            onClick={(() => { "use client"; window.location.reload(); }) as any}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    notFound();
  }

  const { project, projectAudits, healthScore, pagesCrawled, criticalIssuesCount, currentUptimeStatus, vitalsAverages, latestCompletedAudit } = data;
  
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="h-16 border-b border-border/50 flex items-center px-8 glass sticky top-0 z-10 gap-6 shrink-0">
        <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors p-2 -ml-2 rounded-lg hover:bg-white/5 shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex flex-col text-left min-w-0 max-w-[200px] sm:max-w-[350px] md:max-w-[500px]">
          <h1 className="text-lg font-semibold tracking-tight leading-tight truncate" title={project.name}>{project.name}</h1>
          <span className="text-xs text-muted-foreground truncate" title={project.domain}>{project.domain}</span>
        </div>
        
        <div className="ml-auto flex items-center gap-4">
          <DeactivateButton projectId={projectId} />
          {/* Botón de control de auditorías reactivo con sondeo (Polling) y porcentaje de progreso */}
          <AuditControl projectId={projectId} />
        </div>
      </header>
      
      {/* Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-8">
          
          {/* Panel de Métricas Rápidas */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatBox icon={<Activity className="w-5 h-5" />} title="Puntaje de Salud SEO" value={healthScore} />
            <StatBox icon={<Globe className="w-5 h-5" />} title="Páginas Rastreadas" value={pagesCrawled} />
            <StatBox icon={<AlertTriangle className="text-red-400 w-5 h-5" />} title="Problemas Críticos" value={criticalIssuesCount} />
            <StatBox icon={<FileText className="w-5 h-5" />} title="Auditorías Totales" value={projectAudits.length.toString()} />
          </div>

          {/* Panel de Observabilidad (Fase 2) */}
          <div className="glass-card rounded-xl p-6 border-primary/20">
            <h2 className="text-lg font-semibold mb-4 text-left flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              Observabilidad y Rendimiento
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white/[0.02] border border-white/5 rounded-lg p-4">
                <p className="text-xs text-muted-foreground font-medium mb-1">Estado de Servidor</p>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${currentUptimeStatus === 'up' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : currentUptimeStatus === 'down' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-gray-500'}`} />
                  <span className="text-lg font-semibold capitalize">{currentUptimeStatus === 'unknown' ? 'Sin datos' : currentUptimeStatus}</span>
                </div>
              </div>
              
              <div className="bg-white/[0.02] border border-white/5 rounded-lg p-4">
                <p className="text-xs text-muted-foreground font-medium mb-1">LCP (Promedio)</p>
                <p className={`text-lg font-semibold ${vitalsAverages.LCP > 2500 ? 'text-red-400' : vitalsAverages.LCP > 0 ? 'text-green-400' : ''}`}>
                  {vitalsAverages.LCP ? `${Math.round(vitalsAverages.LCP)}ms` : '--'}
                </p>
              </div>

              <div className="bg-white/[0.02] border border-white/5 rounded-lg p-4">
                <p className="text-xs text-muted-foreground font-medium mb-1">CLS (Promedio)</p>
                <p className={`text-lg font-semibold ${vitalsAverages.CLS > 0.1 ? 'text-yellow-400' : vitalsAverages.CLS > 0 ? 'text-green-400' : ''}`}>
                  {vitalsAverages.CLS ? vitalsAverages.CLS.toFixed(3) : '--'}
                </p>
              </div>

              <div className="bg-white/[0.02] border border-white/5 rounded-lg p-4">
                <p className="text-xs text-muted-foreground font-medium mb-1">FCP (Promedio)</p>
                <p className={`text-lg font-semibold ${vitalsAverages.FCP > 1800 ? 'text-yellow-400' : vitalsAverages.FCP > 0 ? 'text-green-400' : ''}`}>
                  {vitalsAverages.FCP ? `${Math.round(vitalsAverages.FCP)}ms` : '--'}
                </p>
              </div>
            </div>
            
            <div className="mt-4 pt-4 border-t border-border/50">
              <p className="text-xs text-muted-foreground flex items-center justify-between">
                <span>Añade este script en tu sitio para recolectar Web Vitals:</span>
                <Link href={`/scripts/vitals.js`} className="text-primary hover:underline">Ver Script RUM</Link>
              </p>
              <code className="block mt-2 text-[10px] sm:text-xs bg-black/40 p-3 rounded border border-white/5 text-muted-foreground overflow-x-auto whitespace-pre">
{`<script 
  src="${process.env.NEXT_PUBLIC_APP_URL || 'https://strategicaudit.pro'}/scripts/vitals.js" 
  data-project-id="${project.id}" 
  defer>
</script>`}
              </code>
            </div>
          </div>
          
          {/* Sección de Reportes Enterprise (Fase 1/2) */}
          <div className="glass-card rounded-xl p-6 border-blue-500/10 bg-gradient-to-br from-blue-950/5 via-transparent to-transparent">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-left flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Centro de Reportes
              </h2>
              <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded font-bold uppercase tracking-widest">Premium</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Reporte PDF */}
              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 space-y-4 hover:border-primary/20 transition-all group">
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center border border-red-500/20">
                    <Download className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-left">
                  <h3 className="font-bold text-base group-hover:text-primary transition-colors">Auditoría SEO Completa (PDF)</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Reporte ejecutivo premium con gráficas de errores, sitemap, etiquetas y auditoría técnica detallada.</p>
                </div>
                {latestCompletedAudit ? (
                  <Link 
                    href={`/projects/${projectId}/audits/${latestCompletedAudit.id}`}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline group-active:translate-y-0.5 transition-transform"
                  >
                    Generar Reporte PDF <ArrowRight className="w-4 h-4" />
                  </Link>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Completa una auditoría para generar el PDF.</p>
                )}
              </div>

              {/* Reporte CSV */}
              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 space-y-4 hover:border-green-500/20 transition-all group">
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-xl bg-green-500/10 text-green-400 flex items-center justify-center border border-green-500/20">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-left">
                  <h3 className="font-bold text-base group-hover:text-green-400 transition-colors">Keywords y Rankings (CSV)</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Exportación masiva de palabras clave objetivo, posiciones actuales en SERP y volumen de búsqueda.</p>
                </div>
                <ExportCsvButton projectId={projectId} />
              </div>
            </div>
          </div>
          
          {/* Listado de Auditorías Recientes */}
          <div className="glass-card rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4 text-left">Auditorías Recientes</h2>
            {projectAudits.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-border/50 rounded-lg bg-white/[0.02]">
                <Globe className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-20" />
                <h3 className="text-muted-foreground font-medium">No se encontraron auditorías</h3>
                <p className="text-xs text-muted-foreground mt-1">Haz clic en "Auditar Sitio Ahora" en el encabezado para iniciar tu primer análisis SEO.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {projectAudits.map((audit) => {
                  let statusColorText = "Pendiente";
                  if (audit.status === 'completed') statusColorText = "Completado";
                  if (audit.status === 'failed') statusColorText = "Fallido";
                  if (audit.status === 'running') statusColorText = "Analizando";

                  return (
                    <Link 
                      key={audit.id} 
                      href={`/projects/${projectId}/audits/${audit.id}`}
                      className="flex items-center justify-between p-4 bg-white/[0.02] rounded-xl border border-white/5 hover:border-primary/40 hover:bg-white/[0.04] transition-all group cursor-pointer"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-2.5 h-2.5 rounded-full 
                          ${audit.status === 'completed' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 
                            audit.status === 'failed' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 
                            'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)] animate-pulse'}`} 
                        />
                        <div className="text-left">
                          <p className="font-semibold text-sm capitalize flex items-center gap-1.5 group-hover:text-primary transition-colors">
                            Auditoría Completa
                            <span className="text-[10px] font-mono font-normal text-muted-foreground uppercase tracking-wider">({audit.id.substring(0, 8)})</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {audit.createdAt ? new Date(audit.createdAt).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }) : '--'}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2.5 py-0.5 rounded-md font-medium border capitalize
                          ${audit.status === 'completed' ? 'bg-green-500/10 border-green-500/20 text-green-400' :
                            audit.status === 'failed' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                            'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'}`}
                        >
                          {statusColorText}
                        </span>
                        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
          
        </div>
      </main>
    </div>
  );
}

function StatBox({ icon, title, value }: { icon: React.ReactNode; title: string; value: string }) {
  return (
    <div className="glass-card rounded-xl p-5 flex items-center gap-4">
      <div className="w-10 h-10 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center">
        {icon}
      </div>
      <div className="text-left">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <p className="text-xl font-bold">{value}</p>
      </div>
    </div>
  );
}

