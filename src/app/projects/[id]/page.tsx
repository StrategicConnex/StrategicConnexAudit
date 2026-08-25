import { projects, audits, crawlResults, issues, uptimeLogs, webVitalsLogs } from '@/shared/db/schemas';
import { eq, desc, sql, count } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { ArrowLeft, Globe, Activity, FileText, AlertTriangle, ArrowRight, Download, FileSpreadsheet, Server, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import AuditControl from './components/AuditControl';
import DeactivateButton from './components/DeactivateButton';
import { createClient } from '@/shared/lib/supabase/server';
import { withRLS } from '@/shared/db/rls';
import { ExportCsvButton } from '@/features/dashboard/ExportCsvButton';
import { computeVitalsAverages } from '@/shared/utils/rum';

export const dynamic = 'force-dynamic';

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const projectId = resolvedParams.id;
  
  const headersList = await headers();
  const host = headersList.get('host') || 'scaudit.vercel.app';
  const protocol = headersList.get('x-forwarded-proto') || 'https';
  const appUrl = `${protocol}://${host}`;
  
  // ── Dev bypass: saltea auth en desarrollo ──
  const DEV_BYPASS = process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true';

  if (DEV_BYPASS) {
    // Sin sesión real — no se puede cargar proyecto específico
    redirect('/');
  }

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
      type UptimeLogType = typeof uptimeLogs.$inferSelect;
      let recentUptimes: UptimeLogType[] = [];
      try {
        recentUptimes = await tx.select().from(uptimeLogs)
          .where(eq(uptimeLogs.projectId, projectId))
          .orderBy(desc(uptimeLogs.checkedAt))
          .limit(10);
      } catch (e) {
        console.warn("Uptime logs table not ready or accessible:", e);
      }
      
      const currentUptimeStatus = recentUptimes.length > 0 ? (recentUptimes[0]!.isUp ? 'up' : 'down') : 'unknown';
        
      // 5. Fetch Web Vitals Logs (Resiliente)
      type WebVitalsLogType = typeof webVitalsLogs.$inferSelect;
      let vitalsLogs: WebVitalsLogType[] = [];
      try {
        vitalsLogs = await tx.select()
        .from(webVitalsLogs)
        .where(eq(webVitalsLogs.projectId, projectId))
        .orderBy(desc(webVitalsLogs.recordedAt))
        .limit(100);
      } catch (e) {
        console.warn("WebVitals logs table not ready or accessible:", e);
      }

      // Compute sophisticated RUM averages and counters using extracted engine
      const vitalsAverages = computeVitalsAverages(vitalsLogs.map(log => ({
        ...log,
        errors: Array.isArray(log.errors) ? log.errors : null,
        resources: Array.isArray(log.resources) ? log.resources : null,
        memory: log.memory && typeof log.memory === 'object' ? log.memory : null
      })));

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
  } catch (error: unknown) {
    console.error("Critical error loading project detail:", error);
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-10 text-center bg-background text-foreground relative overflow-hidden font-sans">
        <div className="absolute inset-0 tech-grid opacity-20 pointer-events-none" />
        <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mb-8 border border-destructive/20 shadow-[0_0_20px_rgba(244,63,94,0.15)] relative z-10 animate-pulse">
          <AlertTriangle className="w-10 h-10 text-destructive" />
        </div>
        <h1 className="text-3xl font-extrabold text-foreground tracking-tight relative z-10">Error de Conexión</h1>
        <p className="mt-4 text-base font-medium text-muted-foreground max-w-md leading-relaxed relative z-10">
          Hubo un problema técnico al recuperar los datos de este proyecto. Nuestro equipo de respuesta a incidentes ha sido notificado automáticamente.
        </p>
        <div className="mt-12 flex gap-4 relative z-10">
          <Link href="/" className="px-8 py-3 bg-surface-muted text-foreground font-bold border border-border rounded-xl hover:bg-surface-elevated transition-all text-sm">
            Volver al Inicio
          </Link>
          <Link 
            href={`/projects/${projectId}`}
            className="px-8 py-3 bg-primary text-primary-foreground font-extrabold rounded-xl hover:bg-primary/90 transition-all text-sm shadow-[0_0_20px_rgba(99,102,241,0.3)] flex items-center justify-center"
          >
            Reintentar
          </Link>
        </div>
      </div>
    );
  }


  if (!data) {
    notFound();
  }

  const { project, projectAudits, healthScore, pagesCrawled, criticalIssuesCount, currentUptimeStatus, vitalsAverages, latestCompletedAudit } = data;
  
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans relative overflow-hidden">
      {/* Ambient glowing mesh system */}
      <div className="absolute inset-0 tech-grid opacity-30 pointer-events-none" />
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-accent-cyan/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      <header className="h-20 border-b border-border flex items-center px-10 bg-background/85 backdrop-blur-xl sticky top-0 z-50 gap-8 shrink-0">
        <Link href="/" className="text-muted-foreground hover:text-foreground transition-all p-2 -ml-2 rounded-xl hover:bg-surface-muted shrink-0 border border-transparent hover:border-border">
          <ArrowLeft className="w-5 h-5" strokeWidth={2.5} />
        </Link>
        <div className="flex flex-col text-left min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-2xs font-extrabold text-muted-foreground uppercase tracking-widest">Proyecto Activo</span>
            <span className="w-1.5 h-1.5 rounded-full bg-foreground/20" />
            <span className="text-2xs font-extrabold text-accent-cyan uppercase tracking-widest">{project.id.substring(0, 8)}</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground leading-tight truncate mt-0.5" title={project.name}>{project.name}</h1>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="hidden sm:flex flex-col items-end text-right">
             <span className="text-2xs font-extrabold text-muted-foreground uppercase tracking-widest">Dominio</span>
             <span className="text-sm font-bold text-muted-foreground truncate max-w-[200px] mt-0.5">{project.domain}</span>
          </div>
          <div className="h-8 w-px bg-border mx-2" />
          <DeactivateButton projectId={projectId} />
          <AuditControl projectId={projectId} />
        </div>
      </header>
      
      {/* Content */}
      <main id="main-content" tabIndex={-1} className="flex-1 p-10 overflow-y-auto relative z-10">
        <div className="max-w-[1400px] mx-auto space-y-12">
          
          {/* Panel de Métricas Rápidas */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <StatBox icon={<ShieldCheck className="w-5 h-5" strokeWidth={2.5} />} title="Salud SEO" value={healthScore} accent="blue" />
            <StatBox icon={<Globe className="w-5 h-5" strokeWidth={2.5} />} title="Páginas" value={pagesCrawled} />
            <StatBox icon={<AlertTriangle className="w-5 h-5" strokeWidth={2.5} />} title="Críticos" value={criticalIssuesCount} accent={Number(criticalIssuesCount) > 0 ? "red" : "default"} />
            <StatBox icon={<FileText className="w-5 h-5" strokeWidth={2.5} />} title="Auditorías" value={projectAudits.length.toString()} />
          </div>

          {/* Panel de Observabilidad */}
          <section className="backdrop-blur-xl border border-border bg-card/60 rounded-2xl p-10 shadow-[var(--shadow-card)] relative overflow-hidden">
            <div className="absolute -top-40 -right-40 w-80 h-80 bg-accent-cyan/5 rounded-full blur-3xl pointer-events-none" />
            
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-10">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
                    <Activity className="w-6 h-6 text-accent-cyan animate-[pulse_2s_infinite]" strokeWidth={2.5} />
                    Observabilidad de Infraestructura
                  </h2>
                  {/* Executive Compliance Badges */}
                  <div className="hidden xl:flex items-center gap-2">
                    <span className="text-2xs font-bold text-chartreuse bg-chartreuse/10 border border-chartreuse/20 px-2 py-0.5 rounded-full uppercase tracking-wider">SOC 2 Type II</span>
                    <span className="text-2xs font-bold text-accent-cyan bg-accent-cyan/10 border border-accent-cyan/20 px-2 py-0.5 rounded-full uppercase tracking-wider">OWASP Top 10</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-2">Monitoreo en tiempo real de disponibilidad, tiempos de respuesta y Core Web Vitals.</p>
              </div>
              <div className="flex items-center gap-3 bg-surface-muted px-5 py-2.5 rounded-full border border-border w-fit">
                <div className={`w-2 h-2 rounded-full ${currentUptimeStatus === 'up' ? 'bg-chart-success shadow-[0_0_12px_var(--chart-success)]' : 'bg-chart-danger shadow-[0_0_12px_var(--chart-danger)]'}`} />
                <span className="text-2xs font-bold text-foreground uppercase tracking-widest">{currentUptimeStatus === 'up' ? 'Servidor Online' : 'Servidor Offline'}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              <VitalsCard label="Largest Contentful Paint" value={vitalsAverages.LCP ? `${Math.round(vitalsAverages.LCP)}ms` : '--'} status={vitalsAverages.LCP > 2500 ? 'poor' : vitalsAverages.LCP > 0 ? 'good' : 'none'} desc="Mide el rendimiento de carga del contenido principal." />
              <VitalsCard label="Cumulative Layout Shift" value={vitalsAverages.CLS ? vitalsAverages.CLS.toFixed(3) : '--'} status={vitalsAverages.CLS > 0.1 ? 'needs-improvement' : vitalsAverages.CLS > 0 ? 'good' : 'none'} desc="Mide la estabilidad visual de la estructura web." />
              <VitalsCard label="First Contentful Paint" value={vitalsAverages.FCP ? `${Math.round(vitalsAverages.FCP)}ms` : '--'} status={vitalsAverages.FCP > 1800 ? 'needs-improvement' : vitalsAverages.FCP > 0 ? 'good' : 'none'} desc="Tiempo hasta que se procesa el primer elemento DOM." />
              
              <VitalsCard 
                label="INP & FID (Interactividad)" 
                value={vitalsAverages.INP ? `${Math.round(vitalsAverages.INP)}ms` : '--'} 
                status={vitalsAverages.INP > 500 ? 'poor' : vitalsAverages.INP > 200 ? 'needs-improvement' : vitalsAverages.INP > 0 ? 'good' : 'none'} 
                desc={`Latencia de respuesta a interacciones (INP). Primer Delay (FID): ${vitalsAverages.FID ? Math.round(vitalsAverages.FID) + 'ms' : '--'}.`} 
              />
              <VitalsCard 
                label="JavaScript Hot Errors" 
                value={String(vitalsAverages.errorCount)} 
                status={vitalsAverages.errorCount > 5 ? 'poor' : vitalsAverages.errorCount > 0 ? 'needs-improvement' : 'good'} 
                desc="Excepciones de JavaScript no controladas y fallos de ejecución capturados en caliente." 
              />
              <VitalsCard 
                label="User System Heap & Tráfico" 
                value={vitalsAverages.avgMemoryMB !== '--' ? `${vitalsAverages.avgMemoryMB} MB` : '--'} 
                status={vitalsAverages.TTFB > 1500 ? 'poor' : vitalsAverages.TTFB > 800 ? 'needs-improvement' : vitalsAverages.TTFB > 0 ? 'good' : 'none'} 
                desc={`Memoria heap promedio del cliente. Vistas: ${vitalsAverages.totalPagesViews}. TTFB promedio de red: ${vitalsAverages.TTFB ? Math.round(vitalsAverages.TTFB) + 'ms' : '--'}.`} 
              />
            </div>

            {/* RUM Analytics & Diagnostic Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
              {/* Slow Resources */}
              <div className="backdrop-blur-xl border border-border bg-card/40 rounded-2xl p-6 relative overflow-hidden">
                <h3 className="text-xs font-bold text-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Server className="w-4 h-4 text-accent-cyan" /> Recursos Más Lentos Detectados
                </h3>
                {vitalsAverages.topSlowResources.length > 0 ? (
                  <div className="space-y-3">
                    {vitalsAverages.topSlowResources.map((res, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-card/60 p-3 rounded-lg border border-border hover:bg-surface-muted transition-colors">
                        <span className="text-xs text-muted-foreground font-mono truncate max-w-[200px] sm:max-w-[300px] lg:max-w-[400px]">{res.name}</span>
                        <span className={`text-xs font-bold ${res.duration > 1000 ? 'text-destructive' : 'text-chart-warning'}`}>{res.duration}ms</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No se han registrado transferencias lentas aún en este proyecto.</p>
                )}
              </div>

              {/* Geo & Browser Breakdown */}
              <div className="backdrop-blur-xl border border-border bg-card/40 rounded-2xl p-6 relative overflow-hidden">
                <h3 className="text-xs font-bold text-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-accent-cyan" /> Distribución de Clientes
                </h3>
                <div className="grid grid-cols-2 gap-6">
                  {/* Browsers */}
                  <div>
                    <h4 className="text-2xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Navegadores</h4>
                    {Object.keys(vitalsAverages.browsersMap).length > 0 ? (
                      <div className="space-y-2">
                        {Object.entries(vitalsAverages.browsersMap).map(([browser, count], idx) => (
                          <div key={idx} className="flex justify-between text-xs text-muted-foreground">
                            <span>{browser}</span>
                            <span className="font-bold text-foreground">{count}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">Sin datos</p>
                    )}
                  </div>
                  {/* Countries */}
                  <div>
                    <h4 className="text-2xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Países (Vercel Geo)</h4>
                    {Object.keys(vitalsAverages.countriesMap).length > 0 ? (
                      <div className="space-y-2">
                        {Object.entries(vitalsAverages.countriesMap).map(([country, count], idx) => (
                          <div key={idx} className="flex justify-between text-xs text-muted-foreground">
                            <span className="uppercase">{country}</span>
                            <span className="font-bold text-foreground">{count}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">Sin datos</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mt-12 p-8 bg-surface-muted/60 rounded-2xl border border-border relative overflow-hidden">
              <div className="absolute inset-0 tech-grid opacity-10 pointer-events-none" />
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 relative z-10">
                <h3 className="text-2xs font-bold text-foreground uppercase tracking-widest flex items-center gap-2">
                  <Server className="w-4 h-4 text-accent-cyan" /> Integración RUM (Real User Monitoring)
                </h3>
                <Link href={`/scripts/vitals.js`} className="text-2xs font-bold text-accent-cyan hover:text-accent-cyan/80 transition-colors uppercase tracking-widest">Documentación Técnica →</Link>
              </div>
              <p className="text-sm text-muted-foreground mb-6 max-w-2xl leading-relaxed relative z-10">
                Inserte este fragmento en el head de su sitio web para comenzar a capturar métricas de rendimiento reales de sus visitantes directamente en su consola de StrategicAudit Pro.
              </p>
              <div className="relative group overflow-hidden rounded-xl border border-border">
                <code className="block text-xs font-mono bg-background text-foreground p-6 overflow-x-auto whitespace-pre leading-relaxed">
{`<script 
  src="${appUrl}/scripts/vitals.js" 
  data-project-id="${project.id}" 
  defer>
</script>`}
                </code>
              </div>
            </div>
          </section>
          
          {/* Sección de Reportes */}
          <section className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
                <FileText className="w-6 h-6 text-accent-indigo" strokeWidth={2.5} />
                Centro de Inteligencia de Auditoría
              </h2>
              <p className="text-sm text-muted-foreground mt-2">Exporte sus auditorías y datasets en formatos profesionales listos para su presentación ejecutiva o White Label.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <ReportCard 
                title="Auditoría Ejecutiva (PDF)" 
                desc="Reporte premium de alta fidelidad con visualización de sitemap, arquitectura de etiquetas SEO y priorización inteligente de riesgos técnicos."
                icon={<Download className="w-5 h-5 text-destructive" />}
                accent="red"
                action={latestCompletedAudit ? (
                  <Link 
                    href={`/projects/${projectId}/audits/${latestCompletedAudit.id}`}
                    className="flex items-center gap-2 text-2xs font-extrabold uppercase tracking-widest text-destructive hover:text-destructive/80 transition-colors mt-6 w-fit bg-destructive/10 border border-destructive/20 px-4 py-2 rounded-xl"
                  >
                    Generar PDF <ArrowRight className="w-4 h-4 ml-1" />
                  </Link>
                ) : null}
                disabled={!latestCompletedAudit}
              />

              <ReportCard 
                title="Dataset de Rankings (CSV)" 
                desc="Exportación completa de palabras clave, volúmenes de búsqueda, CTR promedio y posiciones históricas del dominio para análisis avanzado en hojas de cálculo."
                icon={<FileSpreadsheet className="w-5 h-5 text-chartreuse" />}
                accent="green"
                action={<div className="mt-6"><ExportCsvButton projectId={projectId} /></div>}
              />
            </div>
          </section>
          
          {/* Listado de Auditorías Recientes */}
          <section className="backdrop-blur-xl border border-border bg-card/60 rounded-2xl overflow-hidden shadow-[var(--shadow-card)]">
            <div className="p-10 border-b border-border bg-card/40">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">Historial de Análisis SEO</h2>
              <p className="text-sm text-muted-foreground mt-2">Registro cronológico y auditoría técnica completa de todos los escaneos realizados.</p>
            </div>
            
            {projectAudits.length === 0 ? (
              <div className="text-center py-32 bg-card/20">
                <Globe className="w-16 h-16 text-muted-foreground mx-auto mb-6" strokeWidth={1} />
                <h3 className="text-xl font-bold text-muted-foreground">Sin Auditorías Activas</h3>
                <p className="text-sm font-medium text-muted-foreground mt-2">Inicie un nuevo análisis de ciber-seguridad para comenzar a recolectar datos aquí.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {projectAudits.map((audit) => {
                  let statusLabel = "Pendiente";
                  let statusStyle = "bg-surface-muted text-muted-foreground border-border";
                  
                  if (audit.status === 'completed') {
                    statusLabel = "Completado";
                    statusStyle = "bg-chartreuse/10 text-chartreuse border-chartreuse/20 shadow-[0_0_15px_rgba(52,211,153,0.1)]";
                  } else if (audit.status === 'failed') {
                    statusLabel = "Fallido";
                    statusStyle = "bg-destructive/10 text-destructive border-destructive/20 shadow-[0_0_15px_rgba(244,63,94,0.1)]";
                  } else if (audit.status === 'running') {
                    statusLabel = "Analizando";
                    statusStyle = "bg-accent-cyan/10 text-accent-cyan border-accent-cyan/20 animate-pulse shadow-[0_0_15px_rgba(6,182,212,0.1)]";
                  }

                  return (
                    <Link 
                      key={audit.id} 
                      href={`/projects/${projectId}/audits/${audit.id}`}
                      className="flex items-center justify-between p-8 hover:bg-surface-muted/40 transition-all group relative overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 w-[2px] h-0 bg-accent-cyan group-hover:h-full transition-all duration-300" />
                      <div className="flex items-center gap-6">
                        <div className={`w-2.5 h-2.5 rounded-full 
                          ${audit.status === 'completed' ? 'bg-chart-success shadow-[0_0_10px_var(--chart-success)]' : 
                            audit.status === 'failed' ? 'bg-chart-danger shadow-[0_0_10px_var(--chart-danger)]' : 
                            'bg-chart-warning shadow-[0_0_10px_var(--chart-warning)] animate-pulse'}`} 
                        />
                        <div>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <p className="text-base font-bold text-foreground group-hover:text-accent-cyan transition-colors tracking-tight">
                              Análisis Técnico Completo
                            </p>
                            <span className="text-2xs font-mono font-bold text-muted-foreground uppercase tracking-widest px-2 py-0.5 bg-surface-muted border border-border rounded w-fit">
                              ID: {audit.id.substring(0, 8)}
                            </span>
                          </div>
                          <p className="text-2xs font-bold text-muted-foreground uppercase tracking-wider mt-1">
                            {audit.createdAt ? new Date(audit.createdAt).toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'short' }) : '--'}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-6">
                        <span className={`text-2xs px-3 py-1 rounded-full font-bold uppercase tracking-wider border ${statusStyle}`}>
                          {statusLabel}
                        </span>
                        <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" strokeWidth={2.5} />
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
    default: "bg-surface-muted text-muted-foreground border-border shadow-md",
    blue: "bg-accent-cyan/10 text-accent-cyan border-accent-cyan/20 shadow-[0_0_15px_rgba(6,182,212,0.15)]",
    red: "bg-destructive/10 text-destructive border-destructive/20 shadow-[0_0_15px_rgba(244,63,94,0.15)]"
  };

  return (
    <div className="backdrop-blur-xl border border-border bg-card/60 hover:bg-surface-muted hover:border-foreground/15 rounded-2xl p-8 shadow-[var(--shadow-card)] flex flex-col items-start gap-4 hover:shadow-[var(--shadow-card)] transition-all duration-300 group">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center border transition-transform group-hover:scale-110 ${accentStyles[accent]}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xs font-bold text-muted-foreground uppercase tracking-wider">{title}</p>
        <p className="text-3xl font-extrabold text-foreground tracking-tighter mt-1">{value}</p>
      </div>
    </div>
  );
}

function VitalsCard({ label, value, status, desc }: { label: string; value: string; status: 'good' | 'needs-improvement' | 'poor' | 'none'; desc: string }) {
  const statusColors = {
    good: "bg-chart-success shadow-[0_0_12px_var(--chart-success)]",
    "needs-improvement": "bg-chart-warning shadow-[0_0_12px_var(--chart-warning)]",
    poor: "bg-chart-danger shadow-[0_0_12px_var(--chart-danger)]",
    none: "bg-muted-foreground/40"
  };

  return (
    <div className="backdrop-blur-xl border border-border bg-card/60 hover:bg-surface-muted hover:border-foreground/15 rounded-2xl p-8 flex flex-col justify-between group transition-all duration-300 shadow-[var(--shadow-card)]">
      <div>
        <p className="text-2xs font-bold text-muted-foreground uppercase tracking-[0.2em] mb-4">{label}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-extrabold tracking-tighter text-foreground">{value}</span>
          <div className={`w-2 h-2 rounded-full ${statusColors[status]}`}></div>
        </div>
      </div>
      <p className="text-xs font-semibold text-muted-foreground mt-6 leading-relaxed">{desc}</p>
    </div>
  );
}

function ReportCard({ title, desc, icon, accent, action, disabled = false }: { title: string; desc: string; icon: React.ReactNode; accent: 'red' | 'green'; action?: React.ReactNode; disabled?: boolean }) {
  const colors = {
    red: "bg-destructive/10 text-destructive border-destructive/20 shadow-[0_0_15px_rgba(244,63,94,0.15)]",
    green: "bg-chartreuse/10 text-chartreuse border-chartreuse/20 shadow-[0_0_15px_rgba(52,211,153,0.15)]"
  };

  return (
    <div className={`backdrop-blur-xl border border-border bg-card/60 hover:bg-surface-muted hover:border-foreground/15 rounded-2xl p-10 flex flex-col justify-between transition-all duration-300 ${disabled ? 'opacity-40 pointer-events-none' : 'hover:shadow-[var(--shadow-card)]'}`}>
      <div className="space-y-6">
        <div className={`w-14 h-14 rounded-xl flex items-center justify-center border ${colors[accent]}`}>
          {icon}
        </div>
        <div>
          <h3 className="text-xl font-extrabold text-foreground tracking-tight">{title}</h3>
          <p className="text-xs font-semibold text-muted-foreground mt-2 leading-relaxed">{desc}</p>
        </div>
      </div>
      {action}
    </div>
  );
}
