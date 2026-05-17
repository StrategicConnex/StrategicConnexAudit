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
import { ExportPdfButton } from '@/app/components/ExportPdfButton';

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
  
  const criticalIssues = auditIssues.filter(i => i.severity === 'critical');
  const warningIssues = auditIssues.filter(i => i.severity === 'warning');

  // Funciones de cálculo para el SEO Impact Score
  const calculateImpactScore = (issue: typeof auditIssues[0]) => {
    let score = 50;
    let difficulty = 'Media';
    let roi = 'Medio';
    let urgency = 'Normal';

    // Peso por gravedad
    if (issue.severity === 'critical') {
      score += 30;
      urgency = 'Alta';
      roi = 'Alto';
    } else if (issue.severity === 'warning') {
      score += 10;
    }

    // Ajuste fino por categoría (simulando impacto algorítmico)
    switch (issue.category) {
      case 'meta':
      case 'seo':
        score += 15;
        difficulty = 'Baja'; // Fácil de cambiar texto
        if (issue.severity === 'critical') roi = 'Muy Alto'; // Ej. Falta Title
        break;
      case 'performance':
        score += 10;
        difficulty = 'Alta'; // Optimizar LCP o JS es difícil
        break;
      case 'accessibility':
        score += 5;
        difficulty = 'Media';
        break;
      case 'link':
        score += 12;
        difficulty = 'Baja';
        break;
      case 'security':
        score += 20;
        difficulty = 'Media';
        urgency = 'Alta';
        break;
    }

    // Normalizar a 100
    score = Math.min(100, Math.max(1, score));

    return { score, difficulty, roi, urgency };
  };

  // Ordenar auditIssues por Impact Score (los más urgentes primero)
  const sortedAuditIssues = [...auditIssues].sort((a, b) => {
    return calculateImpactScore(b).score - calculateImpactScore(a).score;
  });
  
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
      {/* Header - Industrial Petroleum Style */}
      <header className="h-16 border-b border-border/50 flex items-center px-8 bg-background/80 backdrop-blur-md sticky top-0 z-10 gap-6 shrink-0 shadow-lg">
        <Link href={`/projects/${projectId}`} className="text-zinc-400 hover:text-white transition-colors p-2 -ml-2 rounded-lg hover:bg-white/5 shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex flex-col text-left min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-white bg-white/20 px-2 py-0.5 rounded border border-white/30 shrink-0">Cybersecurity Audit</span>
            <h1 className="text-sm font-bold text-foreground truncate max-w-[150px] sm:max-w-[300px] md:max-w-[450px]" title={project.name}>/ {project.name}</h1>
          </div>
          <span className="text-[10px] text-muted-foreground font-mono tracking-tighter truncate uppercase">{auditId.substring(0, 12)}</span>
        </div>
        
        <div className="ml-auto flex items-center gap-3">
          <ExportPdfButton targetElementId="pdf-export-content" />
          <div className={`text-xs px-3 py-1 rounded-full font-medium border capitalize flex items-center gap-1.5
            ${audit.status === 'completed' ? 'bg-green-500/10 border-green-500/20 text-green-600' : 
              audit.status === 'failed' ? 'bg-red-500/10 border-red-500/20 text-red-600' : 
              'bg-yellow-500/10 border-yellow-500/20 text-yellow-600'}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${audit.status === 'completed' ? 'bg-green-600 animate-pulse' : audit.status === 'failed' ? 'bg-red-600' : 'bg-yellow-600 animate-pulse'}`} />
            {translatedStatus}
          </div>
        </div>
      </header>

      <main className="flex-1 p-8 overflow-y-auto cyber-grid">
        <div id="pdf-export-content" className="max-w-5xl mx-auto space-y-8 p-4 -m-4 bg-background">
          
          {/* Fila de Score de Salud y Métricas rápidas */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Círculo de Score de Salud SEO - High Impact */}
            <div className="glass-card rounded-2xl p-6 flex flex-col items-center justify-center text-center relative overflow-hidden group shadow-2xl border border-white/10 tech-scanline">
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
              <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-4 text-technical">SEO Quality Score</h3>
              
              <div className="relative w-36 h-36 flex items-center justify-center mb-4">
                <svg className="w-full h-full transform -rotate-90 drop-shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                  <circle
                    cx="72"
                    cy="72"
                    r={radius}
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth="10"
                    fill="transparent"
                  />
                  {/* Gradiente para el trazo */}
                  <defs>
                    <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#10B981" />
                      <stop offset="100%" stopColor="#3B82F6" />
                    </linearGradient>
                  </defs>
                  <circle
                    cx="72"
                    cy="72"
                    r={radius}
                    stroke="url(#scoreGradient)"
                    strokeWidth="12"
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    style={{
                      transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-5xl font-black tracking-tighter text-foreground">
                    {audit.status === 'completed' ? `${healthScore}` : '--'}
                    <span className="text-xl text-muted-foreground">%</span>
                  </span>
                  <span className="text-[10px] text-green-400 uppercase font-bold tracking-widest mt-1">Calidad</span>
                </div>
              </div>
              
              <p className="text-[11px] text-muted-foreground mt-1 max-w-[200px] leading-relaxed">
                {healthScore >= 90 ? "Estado óptimo de excelencia técnica y ciberseguridad." :
                 healthScore >= 70 ? "Bases sólidas. Aplique ajustes recomendados para escalar." :
                 audit.status === 'completed' ? "Requiere intervención inmediata para mitigar riesgos." : "Procesando inteligencia técnica..."}
              </p>
            </div>

            {/* Módulos de métricas secundarias */}
            <div className="md:col-span-2 grid grid-cols-2 gap-4">
              <div className="glass-card rounded-2xl p-6 flex flex-col justify-between border-l-4 border-red-500 shadow-xl bg-background">
                <div>
                  <div className="w-8 h-8 rounded-lg bg-red-500/20 text-red-600 border border-red-500/30 flex items-center justify-center mb-3">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest text-technical">Hallazgos Críticos</h4>
                  <p className="text-4xl font-black mt-1 text-foreground">{audit.status === 'completed' ? criticalIssues.length : '--'}</p>
                </div>
                <p className="text-[10px] text-muted-foreground mt-4 border-t border-border/20 pt-2 text-left font-medium">Prioridad de ejecución inmediata.</p>
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
            <div className="space-y-12">
              
              {/* SECTION 1: RESUMEN EJECUTIVO */}
              <div className="space-y-6">
                <div className="border-b border-border/50 pb-2 flex items-center gap-2">
                  <div className="w-1.5 h-6 bg-primary rounded-full"></div>
                  <h2 className="text-xl font-bold tracking-tight">1. Resumen Ejecutivo</h2>
                </div>

                {/* Infografía de Distribución de Problemas */}
                <div className="glass-card rounded-2xl p-6 border border-border/40 bg-muted/5">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Distribución de Hallazgos por Categoría</h3>
                  
                  {auditIssues.length > 0 ? (
                    <div className="space-y-4">
                      {/* Barras de distribución apiladas */}
                      <div className="h-4 w-full rounded-full flex overflow-hidden border border-border/50">
                        {['seo', 'performance', 'security', 'accessibility', 'link', 'meta'].map(cat => {
                          const count = auditIssues.filter(i => i.category === cat).length;
                          if (count === 0) return null;
                          const percentage = (count / auditIssues.length) * 100;
                          
                          // Colores por categoría
                          let bgClass = 'bg-gray-500';
                          if (cat === 'seo' || cat === 'meta') bgClass = 'bg-blue-500';
                          if (cat === 'performance') bgClass = 'bg-purple-500';
                          if (cat === 'security') bgClass = 'bg-red-500';
                          if (cat === 'link') bgClass = 'bg-yellow-500';
                          
                          return (
                            <div 
                              key={cat} 
                              style={{ width: `${percentage}%` }} 
                              className={`${bgClass} h-full transition-all duration-500 hover:brightness-110`}
                              title={`${cat}: ${count}`}
                            />
                          );
                        })}
                      </div>
                      
                      {/* Leyenda */}
                      <div className="flex flex-wrap gap-4 text-xs">
                        {['seo', 'performance', 'security', 'accessibility', 'link', 'meta'].map(cat => {
                          const count = auditIssues.filter(i => i.category === cat).length;
                          if (count === 0) return null;
                          
                          let bgClass = 'bg-gray-500';
                          let label = cat;
                          if (cat === 'seo' || cat === 'meta') { bgClass = 'bg-blue-500'; label = cat === 'seo' ? 'SEO Técnico' : 'Metadatos'; }
                          if (cat === 'performance') { bgClass = 'bg-purple-500'; label = 'Rendimiento'; }
                          if (cat === 'security') { bgClass = 'bg-red-500'; label = 'Seguridad'; }
                          if (cat === 'link') { bgClass = 'bg-yellow-500'; label = 'Enlaces'; }
                          
                          return (
                            <div key={cat} className="flex items-center gap-1.5">
                              <span className={`w-2.5 h-2.5 rounded-full ${bgClass}`} />
                              <span className="text-muted-foreground capitalize font-medium">{label} <span className="text-foreground font-bold">({count})</span></span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-green-500 flex items-center gap-2 font-medium">
                      <CheckCircle2 className="w-4 h-4" /> No se detectaron problemas para distribuir.
                    </div>
                  )}
                </div>

                {/* Simulador de Snippet de Google - Visualmente Excepcional */}
                <div className="glass-card rounded-2xl p-6 space-y-4 border border-primary/10 bg-primary/5">
                  <div className="flex items-center gap-2 text-blue-500">
                    <Search className="w-5 h-5" />
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-left">Simulador de Resultados (SERP)</h3>
                  </div>
                  <div className="bg-zinc-950/40 border border-border/50 shadow-2xl p-6 rounded-xl space-y-1.5 text-left max-w-2xl font-sans relative">
                    <div className="absolute top-4 right-4 text-[9px] font-bold text-zinc-500 border border-zinc-700/50 px-2 py-0.5 rounded-full bg-zinc-800 uppercase tracking-tighter">Google Desktop Preview</div>
                    <div className="flex items-center gap-2 text-[14px] text-zinc-400 mb-1">
                      <span className="truncate">{project.domain}</span>
                    </div>
                    <h4 className="text-[20px] text-[#8ab4f8] hover:underline cursor-pointer font-medium leading-tight truncate">
                      {crawl.title || "Sin título configurado"}
                    </h4>
                    <p className="text-[14px] text-zinc-400 leading-snug line-clamp-2 mt-1">
                      {crawl.metaDescription || "Configure una meta descripción para aumentar el CTR (Click-Through Rate). Sin ella, Google mostrará fragmentos de texto aleatorios de su sitio."}
                    </p>
                  </div>
                </div>
              </div>

              {/* SECTION 2: ANÁLISIS DE METADATOS */}
              <div className="space-y-6 pt-4">
                <div className="border-b border-border/50 pb-2 flex items-center gap-2">
                  <div className="w-1.5 h-6 bg-blue-500 rounded-full"></div>
                  <h2 className="text-xl font-bold tracking-tight">2. Análisis de Metadatos</h2>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Meta Título */}
                  <div className="glass-card rounded-2xl p-6 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider text-left">Etiqueta de Título (Title)</h3>
                      </div>
                      
                      {/* Infografía de Longitud */}
                      <div className="mb-4 space-y-2">
                        <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                          <span>0</span>
                          <span className="text-green-500 font-bold">Óptimo (50-60)</span>
                          <span>100+</span>
                        </div>
                        <div className="h-2 w-full bg-border/50 rounded-full overflow-hidden relative">
                          {/* Zona óptima */}
                          <div className="absolute left-[50%] right-[40%] h-full bg-green-500/20" />
                          {/* Progreso real */}
                          <div 
                            className={`absolute left-0 top-0 h-full rounded-full transition-all ${
                              !crawl.title ? 'bg-red-500 w-[2%]' :
                              crawl.title.length < 30 ? 'bg-yellow-500' :
                              crawl.title.length > 60 ? 'bg-red-500' : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(100, (crawl.title?.length || 0))}%` }}
                          />
                        </div>
                        <div className="text-right text-xs font-semibold">
                          {crawl.title ? `${crawl.title.length} / 60 caracteres` : <span className="text-red-500">Ausente</span>}
                        </div>
                      </div>

                      <div className="p-4 bg-muted/30 border border-border/50 rounded-xl font-mono text-sm break-words min-h-[4rem] flex items-center text-left mb-4">
                        {crawl.title || <span className="text-destructive italic font-sans text-xs">El elemento de título no existe dentro del head HTML.</span>}
                      </div>

                      {/* Recomendación Dinámica */}
                      {(!crawl.title || crawl.title.length < 30 || crawl.title.length > 60) && (
                        <div className="p-3 rounded-lg bg-blue-500/10 border-l-[3px] border-blue-500 text-[12px] text-blue-300 font-medium text-left">
                          <span className="font-bold uppercase tracking-wider text-[10px] text-blue-400 block mb-1">Recomendación Técnica:</span>
                          {!crawl.title ? "Implementar etiqueta <title> única de 50-60 caracteres." : 
                           crawl.title.length < 30 ? "El título es demasiado corto. Incluya palabras clave estratégicas (Ej: IT/OT Security)." : 
                           "El título excede los 60 caracteres y se recortará en buscadores. Reduzca el texto."}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Meta Descripción */}
                  <div className="glass-card rounded-2xl p-6 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider text-left">Meta Descripción</h3>
                      </div>
                      
                      {/* Infografía de Longitud */}
                      <div className="mb-4 space-y-2">
                        <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                          <span>0</span>
                          <span className="text-green-500 font-bold">Óptimo (120-155)</span>
                          <span>200+</span>
                        </div>
                        <div className="h-2 w-full bg-border/50 rounded-full overflow-hidden relative">
                          {/* Zona óptima */}
                          <div className="absolute left-[60%] right-[22.5%] h-full bg-green-500/20" />
                          {/* Progreso real */}
                          <div 
                            className={`absolute left-0 top-0 h-full rounded-full transition-all ${
                              !crawl.metaDescription ? 'bg-red-500 w-[2%]' :
                              crawl.metaDescription.length < 100 ? 'bg-yellow-500' :
                              crawl.metaDescription.length > 160 ? 'bg-red-500' : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(100, (crawl.metaDescription?.length || 0) / 2)}%` }}
                          />
                        </div>
                        <div className="text-right text-xs font-semibold">
                          {crawl.metaDescription ? `${crawl.metaDescription.length} / 155 caracteres` : <span className="text-red-500">Ausente</span>}
                        </div>
                      </div>

                      <div className="p-4 bg-muted/30 border border-border/50 rounded-xl font-mono text-sm break-words min-h-[4rem] flex items-center text-left mb-4">
                        {crawl.metaDescription || <span className="text-destructive italic font-sans text-xs">La meta descripción no se encuentra configurada en el sitio.</span>}
                      </div>

                      {/* Recomendación Dinámica */}
                      {(!crawl.metaDescription || crawl.metaDescription.length < 120 || crawl.metaDescription.length > 160) && (
                        <div className="p-3 rounded-lg bg-blue-500/10 border-l-[3px] border-blue-500 text-[12px] text-blue-300 font-medium text-left">
                          <span className="font-bold uppercase tracking-wider text-[10px] text-blue-400 block mb-1">Recomendación Técnica:</span>
                          {!crawl.metaDescription ? "Añadir meta-description persuasiva con llamado a la acción (CTA)." : 
                           crawl.metaDescription.length < 120 ? "La descripción es muy breve. Aproveche hasta 155 caracteres para mejorar el CTR." : 
                           "La descripción es muy larga (>160 car.). Google la recortará, diluyendo el mensaje."}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 3: ESTRUCTURA DE CONTENIDO */}
              <div className="space-y-6 pt-4">
                <div className="border-b border-border/50 pb-2 flex items-center gap-2">
                  <div className="w-1.5 h-6 bg-purple-500 rounded-full"></div>
                  <h2 className="text-xl font-bold tracking-tight">3. Estructura de Contenido</h2>
                </div>

                {/* Jerarquía de Encabezados (H1 / H2) */}
                <div className="glass-card rounded-2xl p-6 space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Heading1 className="w-5 h-5 text-purple-500" />
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider text-left">Jerarquía de Encabezados</h3>
                    </div>
                    
                    {/* Infografía de validación */}
                    <div className="flex gap-2">
                      <span className={`text-xs px-2 py-1 rounded border flex items-center gap-1 ${crawl.h1Tags?.length === 1 ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                        {crawl.h1Tags?.length === 1 ? <CheckCircle2 className="w-3 h-3"/> : <AlertCircle className="w-3 h-3"/>}
                        {crawl.h1Tags?.length || 0} H1 Detectado
                      </span>
                      <span className="text-xs px-2 py-1 bg-muted/20 rounded border border-border/40 text-muted-foreground">
                        {crawl.h2Tags?.length || 0} H2 Detectados
                      </span>
                    </div>
                  </div>

                  <div className="border border-border/40 rounded-xl bg-muted/5 divide-y divide-border/20 overflow-hidden">
                    {/* Fila de H1 */}
                    <div className="p-4 space-y-2 text-left bg-purple-500/5">
                      <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-purple-600 uppercase font-mono">
                        <Heading1 className="w-3.5 h-3.5" />
                        Título Principal H1
                      </div>
                      {crawl.h1Tags && crawl.h1Tags.length > 0 ? (
                        crawl.h1Tags.map((h1, index) => (
                          <div key={index} className="pl-4 border-l-2 border-purple-400 text-lg font-bold py-1 text-foreground">
                            {h1}
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-red-500 italic pl-4 border-l-2 border-red-500/40">
                          ¡No se encontró ninguna etiqueta H1 de jerarquía en esta página!
                        </div>
                      )}
                    </div>

                    {/* Fila de H2 - Visibilidad Mejorada */}
                    <div className="p-6 space-y-4 bg-muted/20 text-left">
                      <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.15em] text-muted-foreground uppercase font-mono">
                        <Heading2 className="w-4 h-4" />
                        Subtítulos H2 (Contenido Semántico)
                      </div>
                      {crawl.h2Tags && crawl.h2Tags.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-4">
                          {crawl.h2Tags.map((h2, index) => (
                            <div key={index} className="flex gap-3 items-start py-2.5 px-4 rounded-xl bg-background border border-border/40 shadow-sm transition-hover hover:border-primary/20">
                              <span className="text-[9px] bg-primary/10 text-primary rounded px-2 py-0.5 font-mono shrink-0 mt-1 border border-primary/10 font-bold uppercase">H2</span>
                              <span className="text-[13px] text-foreground font-medium leading-snug">{h2}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground italic pl-4">
                          No se detectó ningún subtítulo (H2) en la arquitectura del documento.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 4: AUDITORÍA TÉCNICA */}
              <div className="space-y-6 pt-4">
                <div className="border-b border-border/50 pb-2 flex items-center gap-2">
                  <div className="w-1.5 h-6 bg-red-500 rounded-full"></div>
                  <h2 className="text-xl font-bold tracking-tight">4. Auditoría Técnica y Recomendaciones</h2>
                </div>

                <div className="glass-card rounded-2xl p-6">
                  {sortedAuditIssues.length > 0 ? (
                    <div className="space-y-4">
                      {sortedAuditIssues.map((issue) => {
                        const impact = calculateImpactScore(issue);
                        return (
                          <div 
                            key={issue.id} 
                            className={`p-5 rounded-xl border flex flex-col md:flex-row gap-4 items-start justify-between bg-muted/5 transition-all hover:bg-muted/10
                              ${issue.severity === 'critical' ? 'border-destructive/30 shadow-[0_0_15px_rgba(239,68,68,0.05)]' : 'border-yellow-500/30'}`}
                          >
                            <div className="flex flex-col md:flex-row items-start gap-4 w-full">
                              {/* Icono izquierdo Infográfico */}
                              <div className={`p-3 rounded-xl shrink-0 flex flex-col items-center justify-center min-w-[80px]
                                ${issue.severity === 'critical' ? 'bg-red-500/10 border border-red-500/20' : 'bg-yellow-500/10 border border-yellow-500/20'}`}
                              >
                                {issue.severity === 'critical' ? <AlertCircle className="w-8 h-8 text-red-400 mb-1" /> : <AlertTriangle className="w-8 h-8 text-yellow-400 mb-1" />}
                                <span className={`text-[10px] font-bold uppercase tracking-wider ${issue.severity === 'critical' ? 'text-red-400' : 'text-yellow-400'}`}>
                                  {issue.severity === 'critical' ? "CRÍTICO" : "AVISO"}
                                </span>
                              </div>

                              {/* Contenido Central */}
                              <div className="space-y-2 text-left flex-1">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded border border-zinc-700 uppercase font-mono font-semibold">{issue.category}</span>
                                  
                                  {/* Insignia Impact Score Mejorada */}
                                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border bg-blue-500/10 text-blue-400 border-blue-500/20 flex items-center gap-1">
                                    <Sparkles className="w-3 h-3 text-blue-400" /> Score de Impacto: {impact.score}/100
                                  </span>
                                </div>
                                
                                <h4 className="text-base font-bold text-foreground tracking-tight">{issue.title}</h4>
                                <p className="text-sm text-zinc-400 leading-relaxed max-w-3xl">{issue.description}</p>
                                
                                {/* Matrices de Impacto Infográficas */}
                                <div className="grid grid-cols-3 gap-2 pt-3 max-w-md">
                                  <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-lg p-2 flex flex-col items-center justify-center text-center">
                                    <span className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">Prioridad</span>
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${impact.urgency === 'Alta' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'}`}>{impact.urgency}</span>
                                  </div>
                                  <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-lg p-2 flex flex-col items-center justify-center text-center">
                                    <span className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">Dificultad</span>
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${impact.difficulty === 'Alta' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : impact.difficulty === 'Media' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>{impact.difficulty}</span>
                                  </div>
                                  <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-lg p-2 flex flex-col items-center justify-center text-center">
                                    <span className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">Retorno (ROI)</span>
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${impact.roi.includes('Alto') ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>{impact.roi}</span>
                                  </div>
                                </div>

                                {/* Acción sugerida - Estilo Cybersecurity Technical */}
                                {issue.recommendation && (
                                  <div className="mt-4 p-4 rounded-xl bg-sky-500/10 border-l-[3px] border-sky-500 text-sm text-zinc-300 space-y-2 text-left max-w-3xl shadow-sm">
                                    <span className="font-bold text-sky-400 flex items-center gap-2 uppercase tracking-wider text-xs">
                                      <CheckCircle2 className="w-4 h-4 text-sky-400" /> Plan de Acción:
                                    </span>
                                    <p className="leading-relaxed text-zinc-300 font-medium">{issue.recommendation}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-16 border border-dashed border-green-500/20 rounded-2xl bg-green-500/5">
                      <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto mb-4 animate-pulse" />
                      <h3 className="font-bold text-green-400 text-lg">¡Auditoría Técnica Impecable!</h3>
                      <p className="text-sm text-green-300 mt-2 max-w-md mx-auto">Analizamos la infraestructura técnica y de contenido de {project.name} y no encontramos oportunidades críticas de optimización.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
