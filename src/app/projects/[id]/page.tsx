import { db } from '@/shared/db';
import { projects, audits, crawlResults, issues, uptimeLogs, webVitalsLogs } from '@/shared/db/schemas';
import { eq, desc, sql, count, avg } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { ArrowLeft, Globe, Activity, FileText, AlertTriangle, ArrowRight, Download, FileSpreadsheet, Server, Zap, ShieldCheck } from 'lucide-react';
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
  
  const headersList = await headers();
  const host = headersList.get('host') || 'scaudit.vercel.app';
  const protocol = headersList.get('x-forwarded-proto') || 'https';
  const appUrl = `${protocol}://${host}`;
  
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
      <div className="flex flex-col items-center justify-center min-h-screen p-10 text-center bg-background">
        <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-8 border border-red-500/20">
          <AlertTriangle className="w-10 h-10 text-red-400" />
        </div>
        <h1 className="text-3xl font-bold text-apple-ink tracking-tight">Error de Conexión</h1>
        <p className="mt-4 text-[15px] font-medium text-apple-ink/40 max-w-md leading-relaxed">
          Hubo un problema técnico al recuperar los datos de este proyecto. Nuestro equipo ha sido notificado.
        </p>
        <div className="mt-12 flex gap-4">
          <Link href="/" className="px-8 py-3 bg-apple-gray text-apple-ink font-bold rounded-apple-pill hover:bg-apple-gray-dark/10 transition-all text-[14px]">
            Volver al Inicio
          </Link>
          <button 
            onClick={(() => { "use client"; window.location.reload(); }) as any}
            className="px-8 py-3 bg-apple-ink text-white font-bold rounded-apple-pill hover:opacity-90 transition-all text-[14px]"
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
    <div className="min-h-screen bg-apple-gray/30 text-apple-ink flex flex-col font-sans">
      <header className="h-20 border-b border-apple-gray-dark/5 flex items-center px-10 bg-background/80 backdrop-blur-xl sticky top-0 z-50 gap-8 shrink-0">
        <Link href="/" className="text-apple-ink/20 hover:text-apple-ink transition-all p-2 -ml-2 rounded-apple-sm hover:bg-apple-gray shrink-0">
          <ArrowLeft className="w-5 h-5" strokeWidth={2.5} />
        </Link>
        <div className="flex flex-col text-left min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-apple-ink/30 uppercase tracking-[0.2em]">Proyecto Activo</span>
            <span className="w-1 h-1 rounded-full bg-apple-ink/20"></span>
            <span className="text-[11px] font-bold text-apple-blue uppercase tracking-[0.2em]">{project.id.substring(0, 8)}</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight leading-tight truncate mt-0.5" title={project.name}>{project.name}</h1>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="hidden sm:flex flex-col items-right text-right">
             <span className="text-[10px] font-bold text-apple-ink/30 uppercase tracking-widest">Dominio</span>
             <span className="text-[13px] font-bold text-apple-ink/60 truncate max-w-[200px]">{project.domain}</span>
          </div>
          <div className="h-8 w-px bg-apple-gray-dark/10 mx-2"></div>
          <DeactivateButton projectId={projectId} />
          <AuditControl projectId={projectId} />
        </div>
      </header>
      
      {/* Content */}
      <main className="flex-1 p-10 overflow-y-auto">
        <div className="max-w-[1400px] mx-auto space-y-12">
          
          {/* Panel de Métricas Rápidas */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <StatBox icon={<ShieldCheck className="w-5 h-5" strokeWidth={2.5} />} title="Salud SEO" value={healthScore} accent="blue" />
            <StatBox icon={<Globe className="w-5 h-5" strokeWidth={2.5} />} title="Páginas" value={pagesCrawled} />
            <StatBox icon={<AlertTriangle className="w-5 h-5" strokeWidth={2.5} />} title="Críticos" value={criticalIssuesCount} accent={Number(criticalIssuesCount) > 0 ? "red" : "default"} />
            <StatBox icon={<FileText className="w-5 h-5" strokeWidth={2.5} />} title="Auditorías" value={projectAudits.length.toString()} />
          </div>

          {/* Panel de Observabilidad */}
          <section className="glass-card rounded-apple-md p-10 shadow-sm">
            <div className="flex items-center justify-between mb-10">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-apple-ink flex items-center gap-3">
                  <Activity className="w-7 h-7 text-apple-blue" strokeWidth={2.5} />
                  Observabilidad de Infraestructura
                </h2>
                <p className="text-[15px] font-medium text-apple-ink/40 mt-2">Monitoreo en tiempo real de disponibilidad y experiencia de usuario.</p>
              </div>
              <div className="flex items-center gap-3 bg-apple-gray px-5 py-2.5 rounded-apple-pill border border-apple-gray-dark/5">
                <div className={`w-2.5 h-2.5 rounded-full ${currentUptimeStatus === 'up' ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.4)]' : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]'}`} />
                <span className="text-[13px] font-bold text-apple-ink uppercase tracking-widest">{currentUptimeStatus === 'up' ? 'Servidor Online' : 'Servidor Offline'}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              <VitalsCard label="Largest Contentful Paint" value={vitalsAverages.LCP ? `${Math.round(vitalsAverages.LCP)}ms` : '--'} status={vitalsAverages.LCP > 2500 ? 'poor' : vitalsAverages.LCP > 0 ? 'good' : 'none'} desc="Mide el rendimiento de carga del contenido principal." />
              <VitalsCard label="Cumulative Layout Shift" value={vitalsAverages.CLS ? vitalsAverages.CLS.toFixed(3) : '--'} status={vitalsAverages.CLS > 0.1 ? 'needs-improvement' : vitalsAverages.CLS > 0 ? 'good' : 'none'} desc="Mide la estabilidad visual de la página." />
              <VitalsCard label="First Contentful Paint" value={vitalsAverages.FCP ? `${Math.round(vitalsAverages.FCP)}ms` : '--'} status={vitalsAverages.FCP > 1800 ? 'needs-improvement' : vitalsAverages.FCP > 0 ? 'good' : 'none'} desc="Tiempo hasta que se renderiza el primer texto/imagen." />
            </div>
            
            <div className="mt-12 p-8 bg-apple-gray rounded-apple-md border border-apple-gray-dark/5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[13px] font-bold text-apple-ink/60 uppercase tracking-widest">Integración RUM (Real User Monitoring)</h3>
                <Link href={`/scripts/vitals.js`} className="text-[12px] font-bold text-apple-blue hover:underline">Documentación Técnica →</Link>
              </div>
              <p className="text-[14px] font-medium text-apple-ink/40 mb-6 max-w-2xl leading-relaxed">
                Inserte este fragmento en el `&lt;head&gt;` de su sitio web para comenzar a capturar métricas de rendimiento reales de sus visitantes.
              </p>
              <div className="relative group">
                <code className="block text-[13px] font-mono bg-apple-ink text-apple-gray-light p-6 rounded-apple-sm overflow-x-auto whitespace-pre leading-relaxed border border-white/5">
{`<script 
  src="${appUrl}/scripts/vitals.js" 
  data-project-id="${project.id}" 
  defer>
</script>`}
                </code>
                <button className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white p-2 rounded-apple-sm transition-all opacity-0 group-hover:opacity-100 border border-white/10">
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>
          </section>
          
          {/* Sección de Reportes */}
          <section className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-apple-ink flex items-center gap-3">
                  <FileText className="w-7 h-7 text-apple-ink" strokeWidth={2.5} />
                  Centro de Inteligencia
                </h2>
                <p className="text-[15px] font-medium text-apple-ink/40 mt-2">Exporte sus auditorías en formatos profesionales para presentaciones ejecutivas.</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <ReportCard 
                title="Auditoría Ejecutiva (PDF)" 
                desc="Reporte de alta fidelidad con visualización de sitemap, arquitectura de etiquetas y priorización de riesgos técnicos."
                icon={<Download className="w-6 h-6" />}
                accent="red"
                action={latestCompletedAudit ? (
                  <Link 
                    href={`/projects/${projectId}/audits/${latestCompletedAudit.id}`}
                    className="flex items-center gap-2 text-[14px] font-bold text-red-400 hover:opacity-80 transition-all mt-4"
                  >
                    Generar PDF <ArrowRight className="w-4 h-4" />
                  </Link>
                ) : null}
                disabled={!latestCompletedAudit}
              />

              <ReportCard 
                title="Dataset de Rankings (CSV)" 
                desc="Exportación completa de palabras clave, volúmenes de búsqueda y posiciones históricas para análisis en hojas de cálculo."
                icon={<FileSpreadsheet className="w-6 h-6" />}
                accent="green"
                action={<div className="mt-4"><ExportCsvButton projectId={projectId} /></div>}
              />
            </div>
          </section>
          
          {/* Listado de Auditorías Recientes */}
          <section className="glass-card rounded-apple-md overflow-hidden shadow-sm">
            <div className="p-10 border-b border-apple-gray">
              <h2 className="text-2xl font-bold tracking-tight text-apple-ink">Historial de Análisis</h2>
              <p className="text-[15px] font-medium text-apple-ink/40 mt-2">Registro cronológico de todas las auditorías técnicas realizadas.</p>
            </div>
            
            {projectAudits.length === 0 ? (
              <div className="text-center py-32 bg-apple-gray/10">
                <Globe className="w-16 h-16 text-apple-ink/10 mx-auto mb-6" strokeWidth={1} />
                <h3 className="text-xl font-bold text-apple-ink/30">Sin Auditorías</h3>
                <p className="text-[14px] font-medium text-apple-ink/20 mt-2">Inicie un nuevo análisis para ver los resultados aquí.</p>
              </div>
            ) : (
              <div className="divide-y divide-apple-gray">
                {projectAudits.map((audit) => {
                  let statusLabel = "Pendiente";
                  let statusStyle = "bg-apple-gray text-apple-ink/40 border-apple-gray-dark/5";
                  
                  if (audit.status === 'completed') {
                    statusLabel = "Completado";
                    statusStyle = "bg-green-500/10 text-green-400 border-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.1)]";
                  } else if (audit.status === 'failed') {
                    statusLabel = "Fallido";
                    statusStyle = "bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]";
                  } else if (audit.status === 'running') {
                    statusLabel = "Analizando";
                    statusStyle = "bg-apple-blue/10 text-apple-blue border-apple-blue/20 animate-pulse shadow-[0_0_15px_rgba(0,122,255,0.1)]";
                  }

                  return (
                    <Link 
                      key={audit.id} 
                      href={`/projects/${projectId}/audits/${audit.id}`}
                      className="flex items-center justify-between p-8 hover:bg-apple-gray/30 transition-all group"
                    >
                      <div className="flex items-center gap-6">
                        <div className={`w-3 h-3 rounded-full 
                          ${audit.status === 'completed' ? 'bg-green-500' : 
                            audit.status === 'failed' ? 'bg-red-500' : 
                            'bg-yellow-500 animate-pulse'}`} 
                        />
                        <div>
                          <div className="flex items-center gap-3">
                            <p className="text-[16px] font-bold text-apple-ink group-hover:text-apple-blue transition-colors tracking-tight">
                              Análisis Técnico Completo
                            </p>
                            <span className="text-[11px] font-mono font-bold text-apple-ink/20 uppercase tracking-widest px-2 py-0.5 bg-apple-gray rounded">
                              ID: {audit.id.substring(0, 8)}
                            </span>
                          </div>
                          <p className="text-[13px] font-medium text-apple-ink/40 mt-1">
                            {audit.createdAt ? new Date(audit.createdAt).toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'short' }) : '--'}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-6">
                        <span className={`text-[11px] px-3 py-1 rounded-apple-pill font-bold uppercase tracking-widest border ${statusStyle}`}>
                          {statusLabel}
                        </span>
                        <ArrowRight className="w-5 h-5 text-apple-ink/10 group-hover:text-apple-ink group-hover:translate-x-1 transition-all" strokeWidth={2.5} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
          
        </div>
      </main>
    </div>
  );
}

function StatBox({ icon, title, value, accent = "default" }: { icon: React.ReactNode; title: string; value: string; accent?: "default" | "blue" | "red" }) {
  const accentStyles = {
    default: "bg-apple-gray text-apple-ink border-apple-gray-dark/5",
    blue: "bg-apple-blue/5 text-apple-blue border-apple-blue/10",
    red: "bg-red-500/10 text-red-400 border-red-500/20"
  };

  return (
    <div className="glass-card rounded-apple-md p-8 shadow-sm flex flex-col items-start gap-4 hover:shadow-md transition-all group">
      <div className={`w-12 h-12 rounded-apple-sm flex items-center justify-center border transition-transform group-hover:scale-110 ${accentStyles[accent]}`}>
        {icon}
      </div>
      <div>
        <p className="text-[11px] font-bold text-apple-ink/30 uppercase tracking-widest">{title}</p>
        <p className="text-3xl font-bold text-apple-ink tracking-tighter mt-1">{value}</p>
      </div>
    </div>
  );
}

function VitalsCard({ label, value, status, desc }: { label: string; value: string; status: 'good' | 'needs-improvement' | 'poor' | 'none'; desc: string }) {
  const statusStyles = {
    good: "text-green-500 bg-green-500",
    "needs-improvement": "text-yellow-500 bg-yellow-500",
    poor: "text-red-500 bg-red-500",
    none: "text-apple-ink/10 bg-apple-ink/10"
  };

  return (
    <div className="bg-apple-gray/30 border border-apple-gray-dark/5 rounded-apple-md p-8 flex flex-col justify-between group hover:bg-apple-gray transition-colors">
      <div>
        <p className="text-[12px] font-bold text-apple-ink/40 uppercase tracking-[0.15em] mb-4">{label}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold tracking-tighter text-apple-ink">{value}</span>
          <div className={`w-2 h-2 rounded-full ${statusStyles[status].split(' ')[1]}`}></div>
        </div>
      </div>
      <p className="text-[13px] font-medium text-apple-ink/40 mt-6 leading-relaxed">{desc}</p>
    </div>
  );
}

function ReportCard({ title, desc, icon, accent, action, disabled = false }: { title: string; desc: string; icon: React.ReactNode; accent: 'red' | 'green'; action?: React.ReactNode; disabled?: boolean }) {
  const colors = {
    red: "bg-red-500/10 text-red-400 border-red-500/20",
    green: "bg-green-500/10 text-green-400 border-green-500/20"
  };

  return (
    <div className={`glass-card rounded-apple-md p-10 shadow-sm flex flex-col justify-between transition-all ${disabled ? 'opacity-50 grayscale' : 'hover:shadow-md'}`}>
      <div className="space-y-6">
        <div className={`w-14 h-14 rounded-apple-sm flex items-center justify-center border ${colors[accent]}`}>
          {icon}
        </div>
        <div>
          <h3 className="text-xl font-bold text-apple-ink tracking-tight">{title}</h3>
          <p className="text-[15px] font-medium text-apple-ink/40 mt-2 leading-relaxed">{desc}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

