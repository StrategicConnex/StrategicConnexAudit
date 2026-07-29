import React from "react";
import { BookOpen, Shield, Wrench, GitBranch, BellRing, TrendingUp, SearchCheck } from "lucide-react";

/* --- Card data ----------------------------------------------------------- */

interface DocCard {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  category: string;
}

const DOCS: DocCard[] = [
  {
    title: "Instalación",
    description: "Guía paso a paso para configurar el entorno de desarrollo local. Supabase, Upstash Redis, OpenRouter y variables de entorno.",
    href: "/docs/installation",
    icon: <Wrench size={20} />,
    category: "Guía",
  },
  {
    title: "API Reference",
    description: "Documentación completa de la API REST pública de SCAUDIT: autenticación, endpoints, schemas y rate limiting.",
    href: "/docs/api",
    icon: <BookOpen size={20} />,
    category: "Referencia",
  },
  {
    title: "Seguridad",
    description: "Arquitectura de seguridad: CSP, rate limiting, protección SSRF, open redirect, audit logging y SIEM exporter.",
    href: "/docs/security",
    icon: <Shield size={20} />,
    category: "Referencia",
  },
  {
    title: "Pipeline DNS/WHOIS",
    description: "Arquitectura del pipeline de descubrimiento continuo P0.2: persistencia, change detection y alertas SIEM multicanal.",
    href: "/docs/architecture/pipeline-history",
    icon: <GitBranch size={20} />,
    category: "Arquitectura",
  },
  {
    title: "Alertas SIEM",
    description: "Configuración de alertas multicanal Slack, Email (Resend), PagerDuty y Splunk. Variables de entorno y troubleshooting.",
    href: "/docs/guides/alerting-setup",
    icon: <BellRing size={20} />,
    category: "Guía",
  },
  {
    title: "Roadmap",
    description: "Plan de mejora continua con 34 items priorizados. Fase 0 (cimientos) completada, Fase 1 (core) en progreso.",
    href: "/docs/improvements/roadmap",
    icon: <TrendingUp size={20} />,
    category: "Plan",
  },
  {
    title: "Análisis Competitivo",
    description: "Comparativa con Shodan, Censys, Detectify, SecurityTrails, DNSlytics, urlscan.io y Pentest-Tools.",
    href: "/docs/improvements/competitive-analysis",
    icon: <SearchCheck size={20} />,
    category: "Plan",
  },
  {
    title: "Changelog",
    description: "Historial completo de cambios organizado por sprint con fechas, archivos y estado de progreso (22/34 items = 65%).",
    href: "/docs/changelog",
    icon: <BookOpen size={20} />,
    category: "General",
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  "Guía": "border-l-chartreuse bg-chartreuse/5",
  "Referencia": "border-l-primary bg-primary/5",
  "Arquitectura": "border-l-[var(--color-primary)] bg-primary/5",
  "Plan": "border-l-[var(--color-chartreuse)] bg-chartreuse/5",
  "General": "border-l-muted-fg bg-muted/10",
};

const CATEGORY_BADGES: Record<string, string> = {
  "Guía": "text-chartreuse bg-chartreuse/10 border-chartreuse/20",
  "Referencia": "text-primary bg-primary/10 border-primary/20",
  "Arquitectura": "text-[var(--color-primary)] bg-primary/10 border-primary/20",
  "Plan": "text-[var(--color-chartreuse)] bg-chartreuse/10 border-chartreuse/20",
  "General": "text-muted-fg bg-muted/20 border-border",
};

export default function DocsPage() {
  return (
    <div className="space-y-10 animate-fade-in">
      {/* Header */}
      <div className="space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[11px] font-bold uppercase tracking-wider">
          <BookOpen size={14} />
          Documentación
        </div>
        <h1 className="text-display">SCAUDIT Pro Docs</h1>
        <p className="text-muted-fg text-[15px] max-w-2xl leading-relaxed">
          Documentación técnica de StrategicAudit Pro (SCAUDIT) — plataforma enterprise-grade
          de inteligencia de red, monitoreo de superficie de ataque y ciberseguridad continua.
        </p>
      </div>

      {/* Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {DOCS.map((doc) => (
          <a
            key={doc.href}
            href={doc.href}
            className={`group glass-card rounded-xl p-5 border-l-2 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg ${CATEGORY_COLORS[doc.category] || "border-l-border"}`}
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/5 flex items-center justify-center text-primary shrink-0 group-hover:scale-110 transition-transform duration-300">
                {doc.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-[15px] tracking-tight truncate">
                    {doc.title}
                  </h3>
                  <span className={`text-[9px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full border shrink-0 ${CATEGORY_BADGES[doc.category] || ""}`}>
                    {doc.category}
                  </span>
                </div>
                <p className="text-[13px] text-muted-fg leading-relaxed line-clamp-2">
                  {doc.description}
                </p>
              </div>
            </div>
          </a>
        ))}
      </div>

      {/* Footer */}
      <div className="pt-6 border-t border-border text-[12px] text-muted-fg text-center">
        StrategicConnex &copy; {new Date().getFullYear()} &middot;
        <a href="https://github.com/StrategicConnex/StrategicConnexAudit" className="ml-1.5 text-primary hover:underline">
          GitHub
        </a>
        <span className="mx-2">&middot;</span>
        <a href="https://scaudit.vercel.app" className="text-primary hover:underline">
          scaudit.vercel.app
        </a>
      </div>
    </div>
  );
}
