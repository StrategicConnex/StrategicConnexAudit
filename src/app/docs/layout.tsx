import React from "react";
import Link from "next/link";

/* --- Docs sidebar navigation ------------------------------------------- */

const SIDEBAR_SECTIONS = [
  {
    title: "General",
    links: [
      { href: "/docs", label: "Inicio" },
      { href: "/docs/installation", label: "Instalación" },
      { href: "/docs/changelog", label: "Changelog" },
    ],
  },
  {
    title: "Referencia",
    links: [
      { href: "/docs/api", label: "API Reference" },
      { href: "/docs/security", label: "Seguridad" },
    ],
  },
  {
    title: "Arquitectura",
    links: [
      { href: "/docs/architecture/pipeline-history", label: "Pipeline DNS/WHOIS" },
    ],
  },
  {
    title: "Guías",
    links: [
      { href: "/docs/guides/alerting-setup", label: "Alertas SIEM" },
    ],
  },
  {
    title: "Mejoras",
    links: [
      { href: "/docs/improvements/roadmap", label: "Roadmap" },
      { href: "/docs/improvements/competitive-analysis", label: "Análisis Competitivo" },
    ],
  },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-border bg-card/50 backdrop-blur-2xl flex flex-col h-screen sticky top-0 overflow-y-auto">
        <div className="h-16 flex items-center px-6 border-b border-border/50 shrink-0">
          <Link href="/docs" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </div>
            <span className="font-bold text-sm tracking-tight">Documentación</span>
          </Link>
        </div>

        <nav className="flex-1 p-4 space-y-6">
          {SIDEBAR_SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="text-[10px] font-extrabold uppercase tracking-widest text-muted-fg mb-2 px-2">
                {section.title}
              </h3>
              <ul className="space-y-0.5">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="block px-2 py-2 text-[13px] font-medium text-muted-fg hover:text-foreground hover:bg-primary/5 rounded-lg transition-all duration-200"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-border/50 shrink-0">
          <Link
            href="/"
            className="flex items-center gap-2 text-[12px] text-muted-fg hover:text-foreground transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 19-7-7 7-7" />
              <path d="M19 12H5" />
            </svg>
            Volver al Dashboard
          </Link>
        </div>
      </aside>

      {/* Content */}
      <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-8 py-10">
          {children}
        </div>
      </main>
    </div>
  );
}
