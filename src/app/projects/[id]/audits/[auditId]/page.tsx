import { db } from '@/shared/db';
import { projects, audits, crawlResults, issues } from '@/shared/db/schemas';
import { eq, and } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/shared/lib/supabase/server';
import { withRLS } from '@/shared/db/rls';
import { 
  ArrowLeft, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle, 
  Heading1, 
  Heading2, 
  Calendar, 
  Hash, 
  Sparkles,
  Search,
  Check
} from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function AuditDetailPage({ params }: { params: Promise<{ id: string; auditId: string }> }) {
  const resolvedParams = await params;
  const { id: projectId, auditId } = resolvedParams;
  
  // 0. Autenticar usuario
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Ejecutar todo el fetch dentro de un contexto RLS
  const data = await withRLS(user.id, async (tx) => {
    // 1. Obtener proyecto y auditoría
    const projectResult = await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    const project = projectResult[0];
    if (!project) return null;
    
    const auditResult = await tx.select().from(audits).where(and(eq(audits.id, auditId), eq(audits.projectId, projectId))).limit(1);
    const audit = auditResult[0];
    if (!audit) return null;
    
    // 2. Obtener resultado del rastreo (crawl)
    const crawlResultDb = await tx.select().from(crawlResults).where(eq(crawlResults.auditId, auditId)).limit(1);
    const crawl = crawlResultDb[0];
    
    // 3. Obtener problemas de optimización
    const auditIssues = await tx.select().from(issues).where(eq(issues.auditId, auditId));
    
    return { project, audit, crawl, auditIssues };
  });

  if (!data) notFound();
  
  const { project, audit, crawl, auditIssues } = data;
  
  // 4. Filtrar y contar por gravedad
  const criticalIssues = auditIssues.filter(i => i.severity === 'critical');
  const warningIssues = auditIssues.filter(i => i.severity === 'warning');
  
  let healthScore = 100;
  if (audit.status === 'completed') {
    healthScore = Math.max(0, 100 - (criticalIssues.length * 15) - (warningIssues.length * 5));
  }
  
  // Parámetros del círculo de progreso SVG
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (healthScore / 100) * circumference;
  
  // Estilo de color de puntuación
  let scoreColorClass = 'text-green-400';
  let strokeColor = '#22c55e';
  let glowColor = 'rgba(34,197,94,0.3)';
  
  if (healthScore < 50) {
    scoreColorClass = 'text-red-400';
    strokeColor = '#ef4444';
    glowColor = 'rgba(239,68,68,0.3)';
  } else if (healthScore < 85) {
    scoreColorClass = 'text-yellow-400';
    strokeColor = '#eab308';
    glowColor = 'rgba(234,179,8,0.3)';
  }

  let translatedStatus = "Pendiente";
  if (audit.status === 'completed') translatedStatus = "Completado";
  if (audit.status === 'failed') translatedStatus = "Fallido";
  if (audit.status === 'running') translatedStatus = "Analizando";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-border/50 flex items-center px-8 glass sticky top-0 z-10 gap-6 shrink-0">
        <Link href={`/projects/${projectId}`} className="text-muted-foreground hover:text-foreground transition-colors p-2 -ml-2 rounded-lg hover:bg-white/5 shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex flex-col text-left min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20 shrink-0">Reporte de Auditoría</span>
            <h1 className="text-sm font-semibold text-muted-foreground truncate max-w-[150px] sm:max-w-[300px] md:max-w-[450px]" title={project.name}>/ {project.name}</h1>
          </div>
          <span className="text-xs text-muted-foreground font-mono truncate">{auditId.substring(0, 8)}...</span>
        </div>
        
        <div className="ml-auto flex items-center gap-3">
          <div className={`text-xs px-3 py-1 rounded-full font-medium border capitalize flex items-center gap-1.5
            ${audit.status === 'completed' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 
              audit.status === 'failed' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 
              'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${audit.status === 'completed' ? 'bg-green-400 animate-pulse' : audit.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400 animate-pulse'}`} />
            {translatedStatus}
          </div>
        </div>
      </header>

      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-8">
          
          {/* Fila de Score de Salud y Métricas rápidas */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Círculo de Score de Salud SEO */}
            <div className="glass-card rounded-2xl p-6 flex flex-col items-center justify-center text-center relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Salud SEO Global</h3>
              
              <div className="relative w-36 h-36 flex items-center justify-center mb-4">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="72"
                    cy="72"
                    r={radius}
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth="10"
                    fill="transparent"
                  />
                  <circle
                    cx="72"
                    cy="72"
                    r={radius}
                    stroke={strokeColor}
                    strokeWidth="10"
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    style={{
                      transition: 'stroke-dashoffset 1s ease-in-out',
                      filter: `drop-shadow(0 0 8px ${glowColor})`
                    }}
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className={`text-4xl font-extrabold tracking-tight ${scoreColorClass}`}>
                    {audit.status === 'completed' ? `${healthScore}%` : '--'}
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Calidad</span>
                </div>
              </div>
              
              <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
                {healthScore >= 90 ? "Estado óptimo de excelencia. Posibles ajustes muy menores." :
                 healthScore >= 70 ? "Buenas bases. Corrige las advertencias para subir posiciones." :
                 audit.status === 'completed' ? "Requiere corrección urgente para evitar penalizaciones en buscadores." : "La auditoría está siendo procesada..."}
              </p>
            </div>

            {/* Módulos de métricas secundarias */}
            <div className="md:col-span-2 grid grid-cols-2 gap-4">
              <div className="glass-card rounded-2xl p-6 flex flex-col justify-between">
                <div>
                  <div className="w-8 h-8 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 flex items-center justify-center mb-3">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-medium text-muted-foreground">Errores Críticos</h4>
                  <p className="text-3xl font-bold mt-1 text-red-400">{audit.status === 'completed' ? criticalIssues.length : '--'}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-4 border-t border-border/20 pt-2 text-left">Corrige de inmediato para asegurar la indexación.</p>
              </div>

              <div className="glass-card rounded-2xl p-6 flex flex-col justify-between">
                <div>
                  <div className="w-8 h-8 rounded-lg bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 flex items-center justify-center mb-3">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-medium text-muted-foreground">Advertencias</h4>
                  <p className="text-3xl font-bold mt-1 text-yellow-400">{audit.status === 'completed' ? warningIssues.length : '--'}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-4 border-t border-border/20 pt-2 text-left">Oportunidades de mejora para escalabilidad.</p>
              </div>

              <div className="glass-card rounded-2xl p-6 flex flex-col justify-between">
                <div>
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center mb-3">
                    <Hash className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-medium text-muted-foreground">Conteo de Palabras</h4>
                  <p className="text-3xl font-bold mt-1">{crawl?.wordCount || '--'}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-4 border-t border-border/20 pt-2 text-left">La extensión de texto ideal varía según palabra clave.</p>
              </div>

              <div className="glass-card rounded-2xl p-6 flex flex-col justify-between">
                <div>
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center mb-3">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-medium text-muted-foreground">Fecha de Auditoría</h4>
                  <p className="text-sm font-semibold mt-2 text-left">{audit.createdAt ? new Date(audit.createdAt).toLocaleDateString('es-ES') : '--'}</p>
                  <p className="text-xs text-muted-foreground text-left">{audit.createdAt ? new Date(audit.createdAt).toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit'}) : '--'}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-4 border-t border-border/20 pt-2 text-left">Los reportes históricos expiran al actualizar la web.</p>
              </div>
            </div>

          </div>

          {audit.status === 'failed' && (
            <div className="p-6 bg-red-950/20 border border-red-500/30 rounded-2xl flex items-start gap-4">
              <AlertCircle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
              <div className="text-left">
                <h3 className="font-semibold text-red-300">Fallo en el Proceso de Auditoría</h3>
                <p className="text-sm text-red-400/80 mt-1">{audit.errorMessage || "Ocurrió una excepción inesperada durante la ejecución del rastreador."}</p>
              </div>
            </div>
          )}

          {audit.status === 'completed' && crawl && (
            <>
              {/* Simulador de Snippet de Google - Visualmente Excepcional */}
              <div className="glass-card rounded-2xl p-6 space-y-4 border border-blue-500/10 bg-gradient-to-br from-blue-950/10 via-transparent to-transparent">
                <div className="flex items-center gap-2 text-blue-400">
                  <Search className="w-4 h-4" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-left">Simulador de Resultado de Google</h3>
                </div>
                <div className="bg-neutral-900/60 p-5 rounded-xl border border-white/5 space-y-1 text-left max-w-2xl font-sans">
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <span className="bg-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded text-[10px]">Anuncio</span>
                    <span className="truncate hover:underline cursor-pointer">{project.domain}</span>
                  </div>
                  <h4 className="text-xl text-[#8ab4f8] hover:underline cursor-pointer font-medium leading-tight truncate">
                    {crawl.title || "Falta etiqueta de Título"}
                  </h4>
                  <p className="text-sm text-neutral-300 leading-snug line-clamp-2">
                    {crawl.metaDescription || "Falta la etiqueta de meta descripción. Google autogenerará texto genérico de la página, reduciendo la efectividad del clic."}
                  </p>
                </div>
              </div>

              {/* Grid de Metadatos de la Página */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Meta Título */}
                <div className="glass-card rounded-2xl p-6 space-y-4">
                  <div className="flex justify-between items-start">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider text-left">Etiqueta de Título (Title)</h3>
                    <span className={`text-xs px-2.5 py-1 rounded-md font-mono font-medium border
                      ${!crawl.title ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                        crawl.title.length > 60 ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' :
                        'bg-green-500/10 border-green-500/20 text-green-400'}`}
                    >
                      {crawl.title ? `${crawl.title.length} caracteres` : 'Ausente'}
                    </span>
                  </div>
                  <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl font-mono text-sm break-words min-h-[4rem] flex items-center text-left">
                    {crawl.title || <span className="text-red-400 italic font-sans text-xs">El elemento de título no existe dentro del head HTML.</span>}
                  </div>
                </div>

                {/* Meta Descripción */}
                <div className="glass-card rounded-2xl p-6 space-y-4">
                  <div className="flex justify-between items-start">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider text-left">Meta Descripción (Description)</h3>
                    <span className={`text-xs px-2.5 py-1 rounded-md font-mono font-medium border
                      ${!crawl.metaDescription ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                        crawl.metaDescription.length > 160 ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' :
                        'bg-green-500/10 border-green-500/20 text-green-400'}`}
                    >
                      {crawl.metaDescription ? `${crawl.metaDescription.length} caracteres` : 'Ausente'}
                    </span>
                  </div>
                  <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl font-mono text-sm break-words min-h-[4rem] flex items-center text-left">
                    {crawl.metaDescription || <span className="text-red-400 italic font-sans text-xs">La meta descripción no se encuentra configurada en el sitio.</span>}
                  </div>
                </div>

              </div>

              {/* Jerarquía de Encabezados (H1 / H2) */}
              <div className="glass-card rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Heading1 className="w-5 h-5 text-primary" />
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider text-left">Jerarquía de Encabezados</h3>
                  </div>
                  <span className="text-xs px-2 py-0.5 bg-white/5 rounded text-muted-foreground">
                    H1: {crawl.h1Tags?.length || 0} | H2: {crawl.h2Tags?.length || 0}
                  </span>
                </div>

                <div className="border border-border/40 rounded-xl bg-white/[0.01] divide-y divide-border/20 overflow-hidden">
                  {/* Fila de H1 */}
                  <div className="p-4 space-y-2 text-left">
                    <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-primary uppercase font-mono">
                      <Heading1 className="w-3.5 h-3.5" />
                      Título Principal H1
                    </div>
                    {crawl.h1Tags && crawl.h1Tags.length > 0 ? (
                      crawl.h1Tags.map((h1, index) => (
                        <div key={index} className="pl-4 border-l-2 border-primary/40 text-base font-semibold py-1">
                          {h1}
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-red-400 italic pl-4 border-l-2 border-red-500/40">
                        ¡No se encontró ninguna etiqueta H1 de jerarquía en esta página!
                      </div>
                    )}
                  </div>

                  {/* Fila de H2 */}
                  <div className="p-4 space-y-3 bg-neutral-950/20 text-left">
                    <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase font-mono">
                      <Heading2 className="w-3.5 h-3.5" />
                      Subtítulos H2 Detectados
                    </div>
                    {crawl.h2Tags && crawl.h2Tags.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pl-4">
                        {crawl.h2Tags.map((h2, index) => (
                          <div key={index} className="flex gap-2 items-start py-1 px-2 rounded bg-white/[0.02] border border-white/5">
                            <span className="text-[10px] bg-white/10 text-muted-foreground rounded px-1.5 font-mono shrink-0 mt-0.5">#{index+1}</span>
                            <span className="text-xs text-muted-foreground font-medium line-clamp-2">{h2}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground/60 italic pl-4">
                        No se detectó ningún subtítulo (H2) en el documento.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Lista de Infracciones Técnicas de SEO */}
              <div className="glass-card rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider text-left">Problemas de Optimización Encontrados ({auditIssues.length})</h3>
                  {auditIssues.length === 0 && (
                    <span className="text-xs bg-green-500/10 text-green-400 border border-green-500/20 px-2.5 py-1 rounded-md font-medium flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Cero errores detectados
                    </span>
                  )}
                </div>

                {auditIssues.length > 0 ? (
                  <div className="space-y-4">
                    {auditIssues.map((issue) => (
                      <div 
                        key={issue.id} 
                        className={`p-5 rounded-xl border flex flex-col md:flex-row gap-4 items-start justify-between bg-white/[0.01] transition-all hover:bg-white/[0.03]
                          ${issue.severity === 'critical' ? 'border-red-500/15 hover:border-red-500/25' : 'border-yellow-500/15 hover:border-yellow-500/25'}`}
                      >
                        <div className="flex items-start gap-3.5 max-w-3xl">
                          <div className={`p-2 rounded-lg shrink-0 mt-0.5
                            ${issue.severity === 'critical' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'}`}
                          >
                            {issue.severity === 'critical' ? <AlertCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                          </div>
                          <div className="space-y-1.5 text-left">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border
                                ${issue.severity === 'critical' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'}`}
                              >
                                {issue.severity === 'critical' ? "CRÍTICO" : "ADVERTENCIA"}
                              </span>
                              <span className="text-xs bg-white/5 text-muted-foreground px-2 py-0.5 rounded border border-white/5 uppercase font-mono">{issue.category}</span>
                            </div>
                            <h4 className="text-sm font-semibold text-foreground tracking-tight">{issue.title}</h4>
                            <p className="text-xs text-muted-foreground leading-relaxed">{issue.description}</p>
                            
                            {/* Acción sugerida */}
                            {issue.recommendation && (
                              <div className="mt-3 p-3 rounded-lg bg-neutral-900/40 border border-white/5 text-xs text-muted-foreground space-y-1 text-left">
                                <span className="font-semibold text-primary flex items-center gap-1">
                                  <Sparkles className="w-3 h-3" /> Acción Sugerida:
                                </span>
                                <p className="leading-normal">{issue.recommendation}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 border border-dashed border-border/50 rounded-xl bg-white/[0.01]">
                    <CheckCircle2 className="w-12 h-12 text-green-400/80 mx-auto mb-3 opacity-40" />
                    <h3 className="font-semibold text-green-400 text-sm">¡Puntaje de Optimización Perfecto!</h3>
                    <p className="text-xs text-muted-foreground mt-1">Analizamos la página de {project.name} de principio a fin y no encontramos ningún error de optimización técnica.</p>
                  </div>
                )}
              </div>
            </>
          )}

        </div>
      </main>
    </div>
  );
}
