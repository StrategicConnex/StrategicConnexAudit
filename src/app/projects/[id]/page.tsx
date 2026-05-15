import { db } from '@/shared/db';
import { projects, audits, crawlResults, issues, uptimeLogs, webVitalsLogs } from '@/shared/db/schemas';
import { eq, desc, sql } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Globe, Activity, FileText, AlertTriangle, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import AuditControl from './components/AuditControl';
import { createClient } from '@/shared/lib/supabase/server';
import { withRLS } from '@/shared/db/rls';

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
  const data = await withRLS(user.id, async (tx) => {
    // 1. Obtener proyecto de la base de datos
    const projectResult = await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    const project = projectResult[0];
    
    if (!project) {
      return null;
    }
    
    // 2. Obtener historial de auditorías
    const projectAudits = await tx.select().from(audits).where(eq(audits.projectId, projectId)).orderBy(desc(audits.createdAt));

    // 3. Extraer la última auditoría completada con éxito para calcular métricas vivas
    const latestCompletedAudit = projectAudits.find(a => a.status === 'completed');
    
    let healthScore = "--";
    let pagesCrawled = "0";
    let criticalIssuesCount = "0";

    if (latestCompletedAudit) {
      // Optimizamos usando count() en lugar de traer miles de registros a memoria
      const crawlsCountResult = await tx.execute(sql`SELECT count(*)::int as count FROM ${crawlResults} WHERE audit_id = ${latestCompletedAudit.id}`);
      const crawlsCount = crawlsCountResult.rows[0];
      pagesCrawled = (crawlsCount?.count || 0).toString();

      const issueStatsResult = await tx.execute(sql`
        SELECT 
          count(*) filter (where severity = 'critical')::int as critical_count,
          count(*) filter (where severity = 'warning')::int as warning_count
        FROM ${issues} 
        WHERE audit_id = ${latestCompletedAudit.id}
      `);
      const issueStats = issueStatsResult.rows[0];
      
      const criticals = (issueStats as any)?.critical_count || 0;
      const warnings = (issueStats as any)?.warning_count || 0;
      
      criticalIssuesCount = criticals.toString();
      healthScore = Math.max(0, 100 - (criticals * 15) - (warnings * 5)).toString() + "%";
    }

    // 4. Fetch Uptime Logs
    const recentUptimes = await tx.select().from(uptimeLogs)
      .where(eq(uptimeLogs.projectId, projectId))
      .orderBy(desc(uptimeLogs.checkedAt))
      .limit(10);
      
    const currentUptimeStatus = recentUptimes.length > 0 ? (recentUptimes[0].isUp ? 'up' : 'down') : 'unknown';

    // 5. Fetch Web Vitals Logs (Averages optimizados en SQL)
    const vitalsStatsResult = await tx.execute(sql`
      SELECT 
        avg(lcp)::float as avg_lcp,
        avg(cls)::float as avg_cls,
        avg(fcp)::float as avg_fcp
      FROM (
        SELECT lcp, cls, fcp 
        FROM ${webVitalsLogs} 
        WHERE project_id = ${projectId}
        ORDER BY recorded_at DESC
        LIMIT 100
      ) as recent_vitals
    `);
    const vitalsStats = vitalsStatsResult.rows[0];

    const vitalsAverages = {
      LCP: (vitalsStats as any)?.avg_lcp || 0,
      CLS: (vitalsStats as any)?.avg_cls || 0,
      FCP: (vitalsStats as any)?.avg_fcp || 0,
      FID: 0,
    };

    return {
      project,
      projectAudits,
      healthScore,
      pagesCrawled,
      criticalIssuesCount,
      currentUptimeStatus,
      vitalsAverages
    };
  });

  if (!data) {
    notFound();
  }

  const { project, projectAudits, healthScore, pagesCrawled, criticalIssuesCount, currentUptimeStatus, vitalsAverages } = data;
  
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

function DeactivateButton({ projectId }: { projectId: string }) {
  return (
    <form action={async () => {
      'use server';
      const { deactivateProject } = await import('@/app/actions/projects');
      await deactivateProject({ projectId });
      redirect('/');
    }}>
      <button className="bg-destructive/10 text-red-400 hover:bg-destructive/20 hover:text-red-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 border border-destructive/20">
        <AlertTriangle className="w-4 h-4" />
        Desactivar Proyecto
      </button>
    </form>
  );
}
