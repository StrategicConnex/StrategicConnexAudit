"use client";
import React from "react";
import { FadeUp } from "../ui/FadeUp";

export function About() {
  return (
    <section id="about">
      <div className="about-grid">
        <FadeUp>
          <span className="section-label">▸ Acerca de nosotros</span>
          <h2 className="section-title">Agencia de Posicionamiento Web Estratégico y Crecimiento Orgánico</h2>
          <div className="divider"></div>
          <p className="section-desc">Strategic Connex es una agencia especializada en transformar la presencia digital de empresas mediante estrategias SEO avanzadas, arquitectura técnica y contenido de alto impacto que genera autoridad en Google.</p>
          <div className="about-pillars">
            <div className="pillar"><div className="pillar-icon">🎯</div><div className="pillar-text"><strong>SEO Técnico & Arquitectura</strong><span>Optimizamos cada línea de código para que Google te prefiera y tu web cargue a máxima velocidad.</span></div></div>
            <div className="pillar"><div className="pillar-icon">⚙️</div><div className="pillar-text"><strong>Estrategia de Contenido</strong><span>Creamos activos digitales técnicos que atraen leads calificados y construyen autoridad sectorial.</span></div></div>
            <div className="pillar"><div className="pillar-icon">📈</div><div className="pillar-text"><strong>Resultados Basados en Datos</strong><span>Implementamos tracking avanzado y KPIs claros para asegurar que tu inversión se traduzca en crecimiento orgánico real.</span></div></div>
          </div>
        </FadeUp>
        <FadeUp delay={0.2} className="about-visual" aria-hidden={true}>
          <video 
            autoPlay 
            loop 
            muted 
            playsInline 
            className="about-video"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            preload="metadata"
            poster="/logo.png"
          >
            <source src="/images/strategic.webm" type="video/webm" />
          </video>
        </FadeUp>
      </div>
    </section>
  );
}
