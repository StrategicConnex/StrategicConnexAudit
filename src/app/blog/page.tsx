"use client";
import React, { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { BackToTop } from "@/components/layout/BackToTop";
import { CustomCursor } from "@/components/layout/CustomCursor";
import { FloatingWP } from "@/components/layout/FloatingWP";
import { FadeUp } from "@/components/ui/FadeUp";
import { 
  Calendar, 
  Clock, 
  User, 
  Share2, 
  Link2, 
  ArrowRight, 
  Check, 
  ChevronRight, 
  AlertTriangle, 
  CheckCircle2, 
  HelpCircle, 
  BookOpen, 
  Flame, 
  Activity, 
  Globe, 
  Cpu, 
  RefreshCw, 
  Network, 
  Sparkles,
  ExternalLink
} from "lucide-react";
import { CTA } from "@/components/sections/CTA";
import { motion, AnimatePresence } from "framer-motion";

const EnergyTrails3D = dynamic(
  () => import("@/components/ui/EnergyTrails3D").then((mod) => mod.EnergyTrails3D),
  { ssr: false }
);

interface ErrorData {
  id: string;
  num: string;
  title: string;
  ocurre: string;
  impactos: string[];
  correccion: string[];
  snippet?: string;
  hasInteractiveScenario?: boolean;
}

export default function BlogPage() {
  const [activeSection, setActiveSection] = useState("intro");
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showToast, setShowToast] = useState(false);
  const [isScenarioCluster, setIsScenarioCluster] = useState(true);
  const [activeTab, setActiveTab] = useState<"ocurre" | "impacto" | "correccion">("ocurre");
  const [currentUrl, setCurrentUrl] = useState("");

  // SECTIONS for Table of Contents
  const sections = [
    { id: "intro", label: "Introducción" },
    { id: "error-01", label: "01. Search Intent" },
    { id: "error-02", label: "02. Falta de EEAT" },
    { id: "error-03", label: "03. Arquitectura SEO" },
    { id: "error-04", label: "04. Fallas Técnicas" },
    { id: "error-05", label: "05. Sobreoptimización" },
    { id: "error-06", label: "06. Ignorar la IA" },
    { id: "error-07", label: "07. Contenido Estático" },
    { id: "error-08", label: "08. Enlaces Spam" },
    { id: "evitar-errores", label: "Enfoque Estratégico" },
    { id: "partner", label: "Partner Estratégico" },
    { id: "conclusion", label: "Conclusión" },
  ];

  // BLOG ARTICLES DATA STRUCTURING
  const errors: ErrorData[] = [
    {
      id: "error-01",
      num: "01",
      title: "No entender la intención de búsqueda (Search Intent)",
      ocurre: "Se sigue pensando en keywords como objetivo, en lugar de intención. Esto lleva a contenidos genéricos que no responden a una necesidad concreta.",
      impactos: [
        "Baja retención de usuarios",
        "Alta tasa de rebote",
        "Pérdida de relevancia semántica"
      ],
      correccion: [
        "Antes de escribir, preguntate: 👉 ¿Qué problema específico está intentando resolver el usuario?"
      ],
      snippet: "El SEO en 2026 no se basa en palabras clave, sino en resolver intenciones de búsqueda con precisión."
    },
    {
      id: "error-02",
      num: "02",
      title: "Contenido sin EEAT (Experiencia, Autoridad y Confianza)",
      ocurre: "Uso excesivo de contenido generado sin validación, falta de autoría o ausencia de respaldo técnico.",
      impactos: [
        "Bajo posicionamiento en queries competitivas",
        "Falta de credibilidad",
        "Menor visibilidad en AI Overviews"
      ],
      correccion: [
        "Incluir experiencia real o casos de uso",
        "Mostrar autoría clara de especialistas contrastados",
        "Generar contenido consistente y de alta densidad dentro de un área temática enfocada"
      ]
    },
    {
      id: "error-03",
      num: "03",
      title: "Falta de arquitectura SEO (contenido aislado)",
      ocurre: "Se crean artículos independientes sin conexión semántica, técnica ni estratégica entre sí.",
      impactos: [
        "Google no identifica autoridad temática global",
        "Se diluye el valor de rastreo e indexación del contenido",
        "Menor indexación efectiva en nuevas URLs"
      ],
      correccion: [
        "Implementar Páginas Pilar robustas",
        "Crear Clusters Temáticos (Silos)",
        "Realizar un Interlinking estratégico de flujo de autoridad"
      ],
      hasInteractiveScenario: true
    },
    {
      id: "error-04",
      num: "04",
      title: "Problemas técnicos (Core Web Vitals, indexación y performance)",
      ocurre: "Falta de auditorías técnicas periódicas, optimización ineficiente de recursos de servidor o desconocimiento en performance web móvil.",
      impactos: [
        "Lentitud de carga crítica en dispositivos móviles",
        "Problemas graves de rastreo para bots de buscadores",
        "Caída directa y constante en los rankings orgánicos"
      ],
      correccion: [
        "Optimizar velocidad de carga bajo métricas estrictas de Core Web Vitals y experiencia mobile",
        "Mejorar la arquitectura de URLs y jerarquía técnica",
        "Implementar datos estructurados (JSON-LD) enriquecidos",
        "Auditar la indexación regularmente mediante herramientas avanzadas"
      ]
    },
    {
      id: "error-05",
      num: "05",
      title: "Sobreoptimización (keyword stuffing)",
      ocurre: "Prácticas SEO obsoletas que priorizan la densidad artificial de palabras clave en el texto.",
      impactos: [
        "Penalización algorítmica por spam semántico",
        "Contenido de lectura poco natural y frustrante para el usuario",
        "Baja calidad general percibida por los algoritmos de calidad de Google"
      ],
      correccion: [
        "Escribir de forma fluida y natural orientada a humanos",
        "Priorizar la riqueza semántica y sinónimos sobre la repetición lineal",
        "Usar variaciones contextuales y semánticamente relacionadas con el sector"
      ]
    },
    {
      id: "error-06",
      num: "06",
      title: "No optimizar para AI Overviews y búsqueda generativa",
      ocurre: "Desconocimiento absoluto de cómo los motores de búsqueda de nueva generación (como Google SGE y Gemini) utilizan y estructuran el contenido para sus respuestas de IA.",
      impactos: [
        "Menor presencia o desaparición en resultados enriquecidos de IA",
        "Pérdida de tráfico potencial altamente calificado de usuarios listos para convertir"
      ],
      correccion: [
        "Responder preguntas del usuario de forma directa, concisa y clara al inicio",
        "Usar estructuras altamente escaneables (listas, tablas, subtítulos descriptivos)",
        "Incluir definiciones técnicas precisas dentro de bloques específicos de contenido"
      ],
      snippet: "El contenido que no puede ser interpretado por la IA, no será mostrado por Google."
    },
    {
      id: "error-07",
      num: "07",
      title: "Contenido desactualizado",
      ocurre: "Falta de mantenimiento, auditoría y actualización periódica de los contenidos que alguna vez posicionaron.",
      impactos: [
        "Pérdida progresiva y silenciosa de rankings históricos",
        "Menor relevancia semántica frente a competidores activos"
      ],
      correccion: [
        "Actualizar artículos periódicamente con nuevos datos, gráficos y análisis",
        "Incorporar tendencias emergentes de este año",
        "Optimizar y mejorar el contenido ya existente en lugar de enfocarse solo en crear contenido desde cero"
      ]
    },
    {
      id: "error-08",
      num: "08",
      title: "Link building de baja calidad",
      ocurre: "Uso persistente de estrategias de adquisición de enlaces automatizadas, basadas en volumen y no en relevancia temática ni autoridad.",
      impactos: [
        "Perfil de enlaces (Backlink profile) poco confiable y sospechoso",
        "Penalizaciones algorítmicas indirectas por manipulación",
        "Pérdida total de la autoridad acumulada en el dominio"
      ],
      correccion: [
        "Priorizar la relevancia temática del sitio de origen",
        "Buscar enlaces de manera natural (Digital PR, estudios de datos)",
        "Construir relaciones en el sector y generar contenido de alta calidad enlazable de forma orgánica"
      ]
    }
  ];

  // TRACK SCROLL PROGRESS & ACTIVE SECTION
  useEffect(() => {
    setCurrentUrl(window.location.href);

    const handleScroll = () => {
      // Scroll Progress
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (totalHeight > 0) {
        setScrollProgress((window.scrollY / totalHeight) * 100);
      }

      // Active Section Detection
      const currentScroll = window.scrollY + 200;
      for (const section of sections) {
        const el = document.getElementById(section.id);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (currentScroll >= top && currentScroll < top + height) {
            setActiveSection(section.id);
          }
        }
      }
    };

    window.addEventListener("scroll", handleScroll);

    // Dynamic injection of LinkedIn profile badge script
    const script = document.createElement("script");
    script.src = "https://platform.linkedin.com/badges/js/profile.js";
    script.async = true;
    script.defer = true;
    script.type = "text/javascript";
    document.body.appendChild(script);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  // COPY LINK TO CLIPBOARD FUNCTION
  const copyToClipboard = () => {
    navigator.clipboard.writeText(window.location.href);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  return (
    <>
      <div className="global-page-bg" aria-hidden={true}>
        <div className="hero-grid"></div>
        <div className="hero-glow"></div>
        <EnergyTrails3D />
      </div>
      <Navbar />

      {/* READING PROGRESS BAR - PINNED TO TOP */}
      <div 
        className="blog-progress-bar" 
        style={{ width: `${scrollProgress}%` }}
      />

      <main className="blog-magazine-section">
        {/* HERO SECTION */}
        <section id="intro" className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto text-center">
            <FadeUp>
              <div className="blog-hero-meta">
                <Sparkles className="w-3.5 h-3.5 text-gold animate-pulse" />
                MARKETING MAGAZINE / SEO 2026
              </div>
              <h1 className="blog-hero-title">
                Errores SEO que destruyen tu <span>ranking</span>
              </h1>
              <p className="blog-hero-desc">
                Evita estas prácticas que están penalizando tu visibilidad en 2026
              </p>
            </FadeUp>

            {/* METADATA BAR */}
            <FadeUp delay={0.1}>
              <div className="blog-hero-meta-bottom">
                <div className="blog-meta-item">
                  <div className="blog-author-badge">
                    <div className="blog-author-avatar">BC</div>
                    <div className="text-left">
                      <span className="block text-xs text-gray-500">Autor</span>
                      <a 
                        href="https://www.linkedin.com/in/barbara-cherem" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-white hover:text-gold transition-colors font-semibold flex items-center gap-1"
                      >
                        Barbara Cherem <ExternalLink className="w-3 h-3 opacity-60" />
                      </a>
                    </div>
                  </div>
                </div>

                <div className="h-8 w-[1px] bg-white/10 hidden sm:block" />

                <div className="blog-meta-item">
                  <Calendar className="w-4 h-4 text-gold" />
                  <div className="text-left">
                    <span className="block text-xs text-gray-500">Publicado</span>
                    <span className="text-white font-medium">6 de Mayo, 2026</span>
                  </div>
                </div>

                <div className="h-8 w-[1px] bg-white/10 hidden sm:block" />

                <div className="blog-meta-item">
                  <Clock className="w-4 h-4 text-gold" />
                  <div className="text-left">
                    <span className="block text-xs text-gray-500">Lectura</span>
                    <span className="text-white font-medium">6 min aprox.</span>
                  </div>
                </div>

                <div className="h-8 w-[1px] bg-white/10 hidden sm:block" />

                <button 
                  onClick={copyToClipboard}
                  className="blog-share-btn"
                >
                  <Share2 className="w-4 h-4 text-gold" />
                  <span>Compartir</span>
                </button>
              </div>
            </FadeUp>

            {/* ART WORK COVER (HERO IMAGE) */}
            <FadeUp delay={0.2}>
              <div className="blog-hero-cover">
                <img 
                  src="/images/seo_errors_hero.png" 
                  alt="Errores SEO que destruyen tu ranking en 2026" 
                />
                <div className="absolute inset-0 bg-gradient-to-t from-bg via-transparent to-transparent opacity-80" />
                <div className="absolute bottom-6 left-6 right-6 flex justify-between items-end">
                  <span className="px-3 py-1 rounded-md bg-black/60 backdrop-blur-md text-xs text-gold border border-gold/20 font-mono">
                    PRO DIGITAL REPORT
                  </span>
                </div>
              </div>
            </FadeUp>
          </div>
        </section>

        {/* MAGAZINE LAYOUT CONTAINER */}
        <div className="container mx-auto px-6 max-w-7xl">
          <div className="blog-grid-layout">
            
            {/* SIDEBAR - STICKY TABLE OF CONTENTS */}
            <aside className="blog-sidebar-toc lg:block hidden">
              <div className="blog-toc-card">
                <div>
                  <h3 className="blog-toc-title">
                    <BookOpen className="w-3.5 h-3.5" /> Contenido
                  </h3>
                  <nav className="blog-toc-list">
                    {sections.map((section, idx) => (
                      <a
                        key={section.id}
                        href={`#${section.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          document.getElementById(section.id)?.scrollIntoView({ behavior: "smooth" });
                        }}
                        className={`blog-toc-link ${activeSection === section.id ? "active" : ""}`}
                      >
                        <span className="blog-toc-index">0{idx + 1}.</span>
                        <span>{section.label}</span>
                        {activeSection === section.id && (
                          <motion.div layoutId="activeIndicator" className="w-1.5 h-1.5 rounded-full bg-gold ml-auto" />
                        )}
                      </a>
                    ))}
                  </nav>
                </div>

                {/* SOCIAL FLOATING DRAWER */}
                <div className="pt-6 border-t border-white/5 mt-6">
                  <h4 className="text-xs uppercase font-bold tracking-widest text-gray-400 mb-3">Compartir en</h4>
                  <div className="flex gap-2">
                    <a 
                      href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(currentUrl)}`}
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="blog-share-btn"
                    >
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                        <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.779-1.75-1.75s.784-1.75 1.75-1.75 1.75.779 1.75 1.75-.784 1.75-1.75 1.75zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                      </svg>
                    </a>
                    <a 
                      href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(currentUrl)}`}
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="blog-share-btn"
                    >
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                    </a>
                    <button 
                      onClick={copyToClipboard}
                      className="blog-share-btn"
                    >
                      <Link2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* READ PERCENTAGE */}
                <div className="pt-6 border-t border-white/5 mt-6">
                  <div className="flex justify-between text-xs text-gray-400 mb-2">
                    <span>Leído</span>
                    <span className="text-gold font-bold font-mono">{Math.round(scrollProgress)}%</span>
                  </div>
                  <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-gold transition-all duration-150" style={{ width: `${scrollProgress}%` }} />
                  </div>
                </div>
              </div>
            </aside>

            {/* MAIN ARTICLE BODY */}
            <article className="blog-article-body max-w-4xl mx-auto lg:mx-0">
              
              {/* INTRODUCTORY PARAGRAPHS */}
              <div className="blog-intro-card">
                En 2026, el SEO ya no falla por falta de esfuerzo, sino por errores mal entendidos. Mientras muchas empresas producen más contenido, implementan herramientas de IA y optimizan palabras clave, siguen sin posicionar. ¿El motivo? <strong>Están construyendo sobre bases incorrectas.</strong>
                <p className="mt-4 text-sm font-normal text-gray-300 leading-relaxed">
                  Hoy, Google no solo clasifica páginas: evalúa contexto, intención, autoridad y experiencia real. Y cuando detecta inconsistencias, simplemente reduce tu visibilidad orgánica.
                </p>
                <p className="mt-2 text-sm font-normal text-gray-300 leading-relaxed">
                  Este artículo desglosa los errores SEO más críticos que están destruyendo rankings en la actualidad —y cómo corregirlos estratégicamente.
                </p>
              </div>

              {/* SECTION: THE 8 ERRORS */}
              <div className="space-y-12">
                <h2 className="text-2xl md:text-3xl font-montserrat font-bold text-white tracking-tight border-b border-white/10 pb-4">
                  Los 8 Errores Críticos a Evitar
                </h2>

                {errors.map((err) => (
                  <section 
                    key={err.id} 
                    id={err.id} 
                    className="blog-error-card"
                  >
                    {/* Big absolute index number */}
                    <div className="absolute top-4 right-6 text-5xl md:text-6xl font-black font-montserrat text-transparent select-none opacity-20 pointer-events-none" style={{ WebkitTextStroke: "1px rgba(212,175,55,0.4)" }}>
                      {err.num}
                    </div>

                    <div className="flex items-center gap-3 mb-6">
                      <span className="w-2.5 h-2.5 rounded-full bg-gold animate-pulse" />
                      <h3 className="blog-error-title">
                        {err.title}
                      </h3>
                    </div>

                    {/* THREE TIERS CARD STRUCTURE (POR QUE OCURRE, IMPACTO, CÓMO CORREGIR) */}
                    <div className="blog-compare-grid">
                      
                      {/* Tier 1: Por qué ocurre */}
                      <div className="blog-compare-box">
                        <span className="blog-compare-header">
                          <HelpCircle className="w-3.5 h-3.5 text-gold" /> Por qué ocurre
                        </span>
                        <p className="blog-error-desc">
                          {err.ocurre}
                        </p>
                      </div>

                      {/* Tier 2: Impacto Negativo */}
                      <div className="blog-compare-box danger">
                        <span className="blog-compare-header danger">
                          <AlertTriangle className="w-3.5 h-3.5" /> Impacto negativo
                        </span>
                        <ul className="blog-compare-list">
                          {err.impactos.map((imp, idx) => (
                            <li key={idx} className="text-xs text-gray-300 flex items-start gap-1.5">
                              <span className="text-red-500 font-bold">•</span>
                              <span>{imp}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Tier 3: Cómo corregirlo */}
                      <div className="blog-compare-box success">
                        <span className="blog-compare-header success">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Cómo corregirlo
                        </span>
                        <ul className="blog-compare-list">
                          {err.correccion.map((corr, idx) => (
                            <li key={idx} className="text-xs text-gray-200 leading-relaxed flex items-start gap-1.5">
                              <ChevronRight className="w-3 h-3 text-gold-light flex-shrink-0" />
                              <span>{corr}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* ERROR SPECIFIC SNIPPETS */}
                    {err.snippet && (
                      <div className="blog-quote-snippet">
                        " {err.snippet} "
                      </div>
                    )}

                    {/* INTERACTIVE SCENARIO SIMULATOR FOR ERROR 03 */}
                    {err.hasInteractiveScenario && (
                      <div className="blog-simulator-card">
                        <div className="blog-simulator-header">
                          <div>
                            <h4 className="blog-simulator-title">
                              <Network className="w-4 h-4 text-gold" /> Mini escenario interactivo: Arquitectura de Contenidos
                            </h4>
                            <p className="blog-simulator-subtitle">Compara el comportamiento del robot de rastreo de Google</p>
                          </div>
                          
                          {/* SWITCH TOGGLE */}
                          <div className="blog-simulator-toggle">
                            <button
                              onClick={() => setIsScenarioCluster(false)}
                              className={`blog-simulator-btn ${!isScenarioCluster ? "active-isolated" : ""}`}
                            >
                              Contenido Aislado
                            </button>
                            <button
                              onClick={() => setIsScenarioCluster(true)}
                              className={`blog-simulator-btn ${isScenarioCluster ? "active-cluster" : ""}`}
                            >
                              Clusters Temáticos (Silo)
                            </button>
                          </div>
                        </div>

                        {/* VISUAL CRAWL SIMULATION */}
                        <div className="blog-simulator-canvas">
                          {isScenarioCluster ? (
                            /* CLUSTER SCENARIO VIEW */
                            <div className="blog-cluster-container">
                              {/* Central Pillar */}
                              <div className="blog-cluster-pilar">
                                <span>Página Pilar</span>
                                GESTIÓN DOCUMENTAL
                              </div>

                              {/* Surrounding Cluster Pages */}
                              {[
                                { label: "Seguridad IT/OT", x: -110, y: -60 },
                                { label: "Firma Digital", x: 110, y: -60 },
                                { label: "Cumplimiento", x: -110, y: 60 },
                                { label: "Versionado", x: 110, y: 60 },
                              ].map((node, i) => (
                                <React.Fragment key={i}>
                                  {/* Connector Line */}
                                  <svg className="absolute inset-0 w-full h-full pointer-events-none">
                                    <line 
                                      x1="50%" 
                                      y1="50%" 
                                      x2={`calc(50% + ${node.x}px)`} 
                                      y2={`calc(50% + ${node.y}px)`} 
                                      stroke="#D4AF37" 
                                      strokeWidth="1.5" 
                                      strokeDasharray="4 4"
                                      className="opacity-40 animate-pulse"
                                    />
                                  </svg>
                                  {/* Cluster Card */}
                                  <div 
                                    className="blog-cluster-child"
                                    style={{ transform: `translate(${node.x}px, ${node.y}px)` }}
                                  >
                                    {node.label}
                                  </div>
                                </React.Fragment>
                              ))}

                              {/* Crawler bot animated particle */}
                              <motion.div 
                                className="absolute w-3.5 h-3.5 rounded-full bg-gold-light shadow-md shadow-gold"
                                animate={{
                                  x: [0, -110, 0, 110, 0, -110, 0, 110, 0],
                                  y: [0, -60, 0, -60, 0, 60, 0, 60, 0],
                                }}
                                transition={{
                                  duration: 8,
                                  repeat: Infinity,
                                  ease: "easeInOut"
                                }}
                              />
                            </div>
                          ) : (
                            /* ISOLATED SCENARIO VIEW */
                            <div className="blog-isolated-container">
                              {[
                                "Artículo Aislado A",
                                "Artículo B Suelto",
                                "Contenido Huérfano C",
                                "Guía Desconectada D",
                                "Post Desvinculado E",
                                "Texto sin Enlaces F"
                              ].map((label, idx) => (
                                <div key={idx} className="blog-isolated-node">
                                  {label}
                                </div>
                              ))}

                              {/* Lost crawler bot animated particle */}
                              <motion.div 
                                className="absolute w-3.5 h-3.5 rounded-full bg-red-400 shadow-md shadow-red-500"
                                animate={{
                                  x: [-120, -100, -130, 20, 50, -40, 100, -120],
                                  y: [-50, 40, -10, 80, -70, -20, 30, -50],
                                }}
                                transition={{
                                  duration: 6,
                                  repeat: Infinity,
                                  ease: "linear"
                                }}
                              />
                            </div>
                          )}
                        </div>

                        {/* Scenario Verdict Text */}
                        <div className="blog-simulator-verdict">
                          <Check className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isScenarioCluster ? "text-green-400" : "text-red-400"}`} />
                          <div>
                            {isScenarioCluster ? (
                              <p><strong>Ventaja Competitiva Activa:</strong> El rastreador fluye infinitamente entre temas relacionados, consolidando la autoridad semántica global en un silo unificado. Google indexa las páginas en minutos y el ranking se potencia orgánicamente.</p>
                            ) : (
                              <p><strong>Penalización Silenciosa:</strong> Los contenidos huérfanos se quedan estancados. Al no haber puentes de autoridad, el bot de Google abandona el sitio rápidamente devaluando el crawl budget e ignorando tus posts.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                  </section>
                ))}
              </div>

              {/* SGE AI OVERVIEW PREVIEW BOX */}
              <FadeUp>
                <div className="blog-sge-box">
                  <div className="blog-sge-badge">
                    <Sparkles className="w-4 h-4" />
                    SGE - Google AI Search Result Preview (2026)
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-white">Resumen de Inteligencia Artificial</h3>
                    <p className="blog-sge-quote">
                      La optimización en 2026 exige estructuración legible tanto para humanos como para Large Language Models (LLMs). Si un motor de búsqueda generativo no logra decodificar, procesar e interpretar la arquitectura semántica de tu contenido, quedará automáticamente excluido del extracto del SGE.
                    </p>
                    <div className="blog-quote-snippet">
                      "El contenido que no puede ser interpretado por la IA, no será mostrado por Google."
                    </div>
                  </div>
                </div>
              </FadeUp>

              {/* SECTION: STRATEGIC APPROACH */}
              <section id="evitar-errores" className="space-y-6 pt-8">
                <div className="flex items-center gap-3">
                  <Activity className="w-5 h-5 text-gold" />
                  <h2 className="text-2xl md:text-3xl font-montserrat font-bold text-white tracking-tight">
                    Cómo evitar estos errores: enfoque estratégico
                  </h2>
                </div>
                <div className="text-gray-300 space-y-4 leading-relaxed">
                  <p>
                    Corregir estos problemas no es una tarea aislada o cosmética. Requiere una visión integral de ingeniería de búsqueda donde se alineen de forma sinérgica cuatro pilares estratégicos fundamentales:
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-4 mt-6">
                  {[
                    { title: "Estrategia de contenido", desc: "Contenido de alto valor enfocado en dar solución exacta al Search Intent y aliniado al perfil EEAT.", icon: <BookOpen className="w-5 h-5" /> },
                    { title: "Arquitectura SEO", desc: "Jerarquía de carpetas lógica, clusters temáticos (silos) y redireccionamiento óptimo de autoridad.", icon: <Network className="w-5 h-5" /> },
                    { title: "Performance técnica", desc: "Core Web Vitals impecables, optimización crítica de imágenes, recursos HTML y scripts.", icon: <Cpu className="w-5 h-5" /> },
                    { title: "Uso inteligente de IA", desc: "Integración de prompts especializados y estructuración de esquemas JSON-LD optimizados para robots SGE.", icon: <Sparkles className="w-5 h-5" /> }
                  ].map((pilar, idx) => (
                    <div key={idx} className="p-5 rounded-xl bg-white/5 border border-white/5 flex gap-4 items-start">
                      <div className="p-2.5 rounded-lg bg-gold/10 text-gold-light mt-0.5">
                        {pilar.icon}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white mb-1">{pilar.title}</h4>
                        <p className="text-xs text-gray-400 leading-relaxed">{pilar.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-sm text-gray-400 italic mt-6 border-l-2 border-gold-dark pl-4">
                  "En este contexto, muchas empresas descubren que el problema no es la falta de inversión... sino la falta de dirección."
                </p>
              </section>

              {/* SECTION: STRATEGICCONNEX BRAND PRESENTATION */}
              <section id="partner" className="relative p-6 md:p-8 rounded-3xl bg-gradient-to-br from-gold/15 to-transparent border-2 border-gold/30 overflow-hidden">
                <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-gold/10 rounded-full filter blur-xl" />
                
                <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
                  <div>
                    <span className="text-xs text-gold uppercase tracking-widest font-mono block mb-1">PARTNER TECNOLÓGICO</span>
                    <h2 className="text-2xl md:text-3xl font-montserrat font-black text-white">
                      El rol de un partner estratégico en SEO
                    </h2>
                  </div>
                  <div className="px-4 py-2 bg-gold text-black font-extrabold rounded-lg text-sm font-montserrat shadow-lg shadow-gold/10">
                    StrategicConnex
                  </div>
                </div>

                <p className="text-sm text-gray-200 leading-relaxed mb-6">
                  El nivel de complejidad actual de los algoritmos de búsqueda hace que el SEO ya no sea simplemente una tarea de ejecución aislada, sino una verdadera disciplina estratégica aplicada al crecimiento real del negocio. Ahí es donde un partner especializado como <strong>StrategicConnex</strong> marca la diferencia.
                </p>

                <div className="grid sm:grid-cols-2 gap-4 mb-8">
                  {[
                    "Auditoría profunda de errores críticos de indexación",
                    "Diseño de arquitecturas de contenido SEO escalables",
                    "Optimización técnica de frontend y velocidad mobile",
                    "Integración avanzada de inteligencia artificial en flujos de conversión"
                  ].map((item, idx) => (
                    <div key={idx} className="flex gap-2.5 items-start">
                      <CheckCircle2 className="w-4 h-4 text-gold-light mt-0.5 flex-shrink-0" />
                      <span className="text-xs text-gray-300">{item}</span>
                    </div>
                  ))}
                </div>

                {/* LINKEDIN PROFESSIONAL BADGE CONNECT */}
                <div className="blog-linkedin-card">
                  <div className="flex items-center gap-3 text-left w-full sm:w-auto">
                    <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center border border-gold/30 text-gold-light">
                      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                        <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.779-1.75-1.75s.784-1.75 1.75-1.75 1.75.779 1.75 1.75-.784 1.75-1.75 1.75zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                      </svg>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-gray-500 font-bold block">Sigue nuestra comunidad</span>
                      <span className="text-xs font-semibold text-white">StrategicConnex en LinkedIn</span>
                    </div>
                  </div>
                  <a 
                    href="https://www.linkedin.com/company/strategicconnex" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="blog-linkedin-btn"
                  >
                    <span>Conectar en LinkedIn</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                </div>

                <p className="text-xs text-gold-light font-bold text-center mt-6">
                  El objetivo no es solo posicionar, sino convertir visibilidad en crecimiento real y recurrente.
                </p>
              </section>

              {/* SECTION: CONCLUSION */}
              <section id="conclusion" className="space-y-6 pt-4 border-t border-white/5">
                <h2 className="text-2xl md:text-3xl font-montserrat font-bold text-white tracking-tight">
                  Conclusión: en SEO, lo que está mal pesa más que lo que falta
                </h2>
                <p className="text-sm text-gray-300 leading-relaxed">
                  En muchos casos de auditoría corporativa, mejorar el posicionamiento en Google no implica necesariamente redactar masivamente o publicar más posts... sino **corregir y consolidar mejor lo que ya existe**.
                </p>
                
                <div className="p-6 rounded-2xl bg-[#14171A] border border-white/5 space-y-4">
                  <h4 className="text-xs uppercase tracking-widest text-gold font-bold">Por qué esto es vital en 2026:</h4>
                  <ul className="space-y-3">
                    {[
                      { bold: "Google detecta errores con mayor precisión:", normal: " Los algoritmos de Core Updates de Google penalizan de inmediato la mala experiencia de usuario y el spam." },
                      { bold: "La competencia es más sofisticada:", normal: " Los líderes de cada vertical ya aplican arquitecturas SEO complejas y velocidad web en milisegundos." },
                      { bold: "El usuario es más exigente:", normal: " Si el contenido no responde de manera fluida y adaptada al móvil, rebotarán instantáneamente buscando alternativas." }
                    ].map((item, idx) => (
                      <li key={idx} className="text-xs text-gray-300 flex items-start gap-2.5">
                        <span className="text-gold font-extrabold mt-0.5 font-mono">0{idx + 1}.</span>
                        <p><strong>{item.bold}</strong>{item.normal}</p>
                      </li>
                    ))}
                  </ul>
                </div>

                <p className="text-sm text-gray-200">
                  Eliminar de raíz estos errores estructurales puede generar un impacto positivo inmediato y sumamente sostenible en tu autoridad orgánica.
                </p>
              </section>

              {/* AUTHOR SECTION & REDACTION SIGNATURE */}
              <div className="pt-8 border-t border-white/5">
                <div className="blog-author-footer">
                  <div className="flex-shrink-0 flex justify-center sm:justify-start">
                    <div 
                      className="badge-base LI-profile-badge" 
                      data-locale="es_ES" 
                      data-size="medium" 
                      data-theme="light" 
                      data-type="HORIZONTAL" 
                      data-vanity="barbaracheremsc" 
                      data-version="v1"
                    >
                      <a 
                        className="badge-base__link LI-simple-link" 
                        href="https://ar.linkedin.com/in/barbaracheremsc?trk=profile-badge"
                      >
                        Barbara Cherem
                      </a>
                    </div>
                  </div>
                  <div className="space-y-4 text-center sm:text-left flex-1">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gold tracking-widest block">ESCRITO Y REDACTADO POR</span>
                      <h4 className="text-lg font-bold text-white">Barbara Cherem</h4>
                      <p className="text-xs text-gray-400">Especialista en Content Marketing & SEO Strategy</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                      <a 
                        href="https://ar.linkedin.com/in/barbaracheremsc?trk=profile-badge" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-gold/50 text-white flex items-center gap-1.5 transition-all"
                      >
                        <svg className="w-3.5 h-3.5 text-gold fill-current" viewBox="0 0 24 24">
                          <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.779-1.75-1.75s.784-1.75 1.75-1.75 1.75.779 1.75 1.75-.784 1.75-1.75 1.75zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                        </svg>
                        <span>Barbara en LinkedIn</span>
                        <ExternalLink className="w-3 h-3 opacity-60" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              {/* REVERSIBLE COMPLIANCE GATES */}
              <div className="p-6 rounded-2xl bg-gradient-to-br from-[#1C1F24] to-black border border-white/5 text-center space-y-4">
                <div className="w-10 h-10 rounded-full bg-gold/10 flex items-center justify-center mx-auto text-gold">
                  <Flame className="w-5 h-5 animate-bounce" />
                </div>
                <h3 className="text-lg font-bold text-white font-montserrat">¿Tu sitio está perdiendo visibilidad orgánica?</h3>
                <p className="text-xs text-gray-400 max-w-lg mx-auto leading-relaxed">
                  Puede que no necesites inyectar más presupuesto en volumen de contenido, sino corregir y alinear la estrategia actual. En SEO, entender qué está fallando es el primer paso indispensable para volver a crecer de forma sólida.
                </p>
                <button
                  onClick={() => {
                    document.getElementById("cta")?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="inline-flex items-center gap-2 text-xs font-bold text-black bg-gold hover:bg-gold-light px-5 py-2.5 rounded-lg transition-all cursor-pointer shadow-lg shadow-gold/5 hover:-translate-y-0.5"
                >
                  <span>Solicitar Auditoría de Errores SEO</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

            </article>

          </div>
        </div>

        {/* REUSABLE OUTSIDE CTA COMPONENT */}
        <div id="cta" className="mt-20">
          <CTA />
        </div>
      </main>

      <Footer />
      <FloatingWP />
      <BackToTop />
      <CustomCursor />

      {/* COMPACT TOAST NOTIFICATION FOR COPY LINK */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 20, x: "-50%" }}
            className="fixed bottom-10 left-1/2 z-50 px-5 py-3 rounded-xl bg-bg2 border border-gold text-white font-semibold text-xs flex items-center gap-2.5 shadow-2xl shadow-black/80"
          >
            <Check className="w-4 h-4 text-gold animate-scale" />
            <span>¡Enlace copiado al portapapeles con éxito!</span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

