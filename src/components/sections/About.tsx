"use client";
import React from "react";
import { FadeUp } from "../ui/FadeUp";

export function About() {
  return (
    <section id="about">
      <div className="about-grid">
        <FadeUp>
          <span className="section-label">▸ Acerca de nosotros</span>
          <h2 className="section-title">La Primera Consultora de Posicionamiento y Gestión Comercial Integral de Neuquén</h2>
          <div className="divider"></div>
          <p className="section-desc">Strategic Connex es la única consultora en Neuquén que integra marketing B2B, IT y control documental para el sector energético. Operamos en la intersección de la estrategia y la ejecución técnica</p>
          <div className="about-pillars">
            <div className="pillar"><div className="pillar-icon">🎯</div><div className="pillar-text"><strong>Precisión Estratégica</strong><span>Decisiones basadas en datos e inteligencia de mercado para empresas de Vaca Muerta</span></div></div>
            <div className="pillar"><div className="pillar-icon">⚙️</div><div className="pillar-text"><strong>Control Operativo</strong><span>Optimizamos los procesos de homologación técnica</span></div></div>
            <div className="pillar"><div className="pillar-icon">📈</div><div className="pillar-text"><strong>Crecimiento Medible</strong><span>KPIs claros, reportes continuos y mejora progresiva para liderar en mercados exigentes. Somos el aliado estratégico que profesionaliza a las PYMES de la Cuenca Neuquina para convertirlas en proveedores de Élite.</span></div></div>
          </div>
        </FadeUp>
        <FadeUp delay={0.2} className="about-visual" aria-hidden={true}>
          <video src="/images/nosotros.mp4" className="about-video" autoPlay loop muted playsInline aria-label="Video Corporativo" preload="metadata" poster="/logo.png"></video>
        </FadeUp>
      </div>
    </section>
  );
}
