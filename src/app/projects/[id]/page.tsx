import { db } from '@/shared/db';
import { projects, audits, crawlResults, issues } from '@/shared/db/schemas';
import { eq, desc } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { ArrowLeft, Globe, Activity, FileText, AlertTriangle, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import AuditControl from './components/AuditControl';

export const dynamic = 'force-dynamic';

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const projectId = resolvedParams.id;
  
  // 1. Obtener proyecto de la base de datos
  const projectResult = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  const project = projectResult[0];
  
  if (!project) {
    notFound();
  }
  
  // 2. Obtener historial de auditorías
  const projectAudits = await db.select().from(audits).where(eq(audits.projectId, projectId)).orderBy(desc(audits.createdAt));

  // 3. Extraer la última auditoría completada con éxito para calcular métricas vivas
  const latestCompletedAudit = projectAudits.find(a => a.status === 'completed');
  
  let healthScore = "--";
  let pagesCrawled = "0";
  let criticalIssuesCount = "0";

  if (latestCompletedAudit) {
    const crawls = await db.select().from(crawlResults).where(eq(crawlResults.auditId, latestCompletedAudit.id));
    pagesCrawled = crawls.length.toString();

    const auditIssues = await db.select().from(issues).where(eq(issues.auditId, latestCompletedAudit.id));
    const criticals = auditIssues.filter(i => i.severity === 'critical');
    const warnings = auditIssues.filter(i => i.severity === 'warning');
    
    criticalIssuesCount = criticals.length.toString();
    healthScore = Math.max(0, 100 - (criticals.length * 15) - (warnings.length * 5)).toString() + "%";
  }
  
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
          <form action={async () => {
            'use server';
            const { deactivateProject } = await import('@/app/actions/projects');
            await deactivateProject({ projectId });
          }}>
            <button className="bg-destructive/10 text-red-400 hover:bg-destructive/20 hover:text-red-300 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 border border-destructive/20">
              <AlertTriangle className="w-4 h-4" />
              Desactivar Proyecto
            </button>
          </form>

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
