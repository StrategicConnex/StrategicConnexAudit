import React from "react";
import { FileQuestion, Home, BookOpen } from "lucide-react";

export default function DocsNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8 animate-fade-in">
      {/* Large 404 with subtle glow */}
      <div className="relative">
        <div
          className="text-[8rem] font-extrabold leading-none tracking-tight select-none text-border"
          style={{
            textShadow: "0 0 80px oklch(68% 0.14 230 / 0.06), 0 0 160px oklch(68% 0.14 230 / 0.03)",
          }}
        >
          404
        </div>

        {/* Badge */}
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-destructive/10 border border-destructive/20 text-destructive text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">
          <FileQuestion size={12} />
          Página no encontrada
        </div>
      </div>

      {/* Description */}
      <div className="max-w-md space-y-2">
        <h2 className="text-[18px] font-bold tracking-tight">
          Esta ruta de documentación no existe
        </h2>
        <p className="text-[14px] text-muted-fg leading-relaxed">
          La página que buscas no está disponible en la documentación.
          Revisá el listado de documentos disponibles o volvé al inicio.
        </p>
      </div>

      {/* Quick links */}
      <div className="flex items-center gap-3">
        <a
          href="/docs"
          className="glass-card rounded-xl px-5 py-3 flex items-center gap-2.5 text-[13px] font-semibold text-foreground hover:bg-primary/5 hover:border-primary/20 transition-all duration-200 group"
        >
          <BookOpen
            size={16}
            className="group-hover:text-primary transition-colors"
          />
          Documentación
        </a>
        <a
          href="/"
          className="glass-card rounded-xl px-5 py-3 flex items-center gap-2.5 text-[13px] font-semibold text-foreground hover:bg-primary/5 hover:border-primary/20 transition-all duration-200 group"
        >
          <Home
            size={16}
            className="group-hover:text-primary transition-colors"
          />
          Dashboard
        </a>
      </div>

      {/* Subtle search hint */}
      <p className="text-[12px] text-muted-fg/60">
        Rutas disponibles:{" "}
        <code className="text-[11px] text-muted-fg bg-muted/30 px-1.5 py-0.5 rounded-md">
          /docs/installation
        </code>
        {" "}
        <code className="text-[11px] text-muted-fg bg-muted/30 px-1.5 py-0.5 rounded-md">
          /docs/api
        </code>
        {" "}
        <code className="text-[11px] text-muted-fg bg-muted/30 px-1.5 py-0.5 rounded-md">
          /docs/changelog
        </code>
      </p>
    </div>
  );
}
