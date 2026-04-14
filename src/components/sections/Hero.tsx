"use client";
import React from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Counter } from "../ui/Counter";
import { HeroBackground3D } from "../ui/HeroBackground3D";

export function Hero({ onEnter, onLeave }) {
  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 1000], [0, 350]);

  return (
    <section id="hero">
      <motion.div className="hero-bg" aria-hidden={true} style={{ y: heroY }}>
        <div className="hero-grid"></div>
        <div className="hero-glow"></div>
        <div className="hero-glow2"></div>
        <HeroBackground3D />
      </motion.div>
      <div className="hero-content">
        <div className="hero-badge">🔶 PLATAFORMA DE INTELIGENCIA COMERCIAL</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(2rem, 4.5vw, 3.5rem)', lineHeight: '1.1' }}>Control Documental y<br /><span className="accent">Estrategia Comercial</span> para el ecosistema Vaca Muerta.</h1>
        <p className="hero-sub">La única consultora integral en Neuquén que profesionaliza a las PyMEs de la Cuenca Neuquina para convertirlas en proveedores de élite.</p>
        <p className="hero-pain" style={{ marginTop: '1rem', color: 'var(--text-muted)' }}><strong>Evite paradas operativas y multas.</strong> Digitalizamos su gestión documental para garantizar ingresos a pozo sin demoras.</p>
        <div className="hero-actions">
          <a href="#services" className="btn-primary" onMouseEnter={onEnter} onMouseLeave={onLeave}>▶ Explorar Servicios</a>
          <a href="#about" className="btn-outline" onMouseEnter={onEnter} onMouseLeave={onLeave}>Conocer el modelo →</a>
        </div>
        <div className="hero-stats">
          <div className="stat-item"><div className="stat-num">+<Counter to={120} /></div><div className="stat-label">Proyectos ejecutados</div></div>
          <div className="stat-item"><div className="stat-num"><Counter to={98} />%</div><div className="stat-label">Satisfacción de clientes</div></div>
          <div className="stat-item"><div className="stat-num"><Counter to={15} />+</div><div className="stat-label">Años en el sector</div></div>
        </div>
      </div>
    </section>
  );
}
