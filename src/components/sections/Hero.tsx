"use client";
import React from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Counter } from "../ui/Counter";
import { EnergyTrails3D } from "../ui/EnergyTrails3D";

interface HeroProps {
  onEnter: () => void;
  onLeave: () => void;
}

export function Hero({ onEnter, onLeave }: HeroProps) {
  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 1000], [0, 350]);

  return (
    <section id="hero">
      <motion.div className="hero-bg" aria-hidden={true} style={{ y: heroY }}>
        <div className="hero-grid"></div>
        <div className="hero-glow"></div>
        <EnergyTrails3D />
      </motion.div>
      <div className="hero-content">
        <div className="hero-badge"><span style={{color: '#f05252', fontSize: '10px'}}>♦</span> PLATAFORMA DE INTELIGENCIA COMERCIAL</div>
        <h1 className="hero-title" style={{ fontSize: 'clamp(1.8rem, 3.5vw, 3.1rem)', lineHeight: '1.15' }}>
          Control Documental y
          <span className="accent">Estrategia Comercial</span>
          para el ecosistema<br />
          Vaca Muerta.
        </h1>
        <p className="hero-sub" style={{ marginTop: '2rem' }}>La única consultora integral en Neuquén que profesionaliza a las PyMEs de la Cuenca Neuquina para convertirlas en proveedores de élite.</p>
        <p className="hero-pain" style={{ marginTop: '1.5rem', color: 'var(--text-muted)' }}><strong>Evite paradas operativas y multas.</strong> Digitalizamos su gestión documental para garantizar<br />ingresos a pozo sin demoras.</p>
        <div className="hero-actions">
          <a href="#services" className="btn-primary" onMouseEnter={onEnter} onMouseLeave={onLeave}>▶ Explorar Servicios</a>
          <a href="#about" className="btn-outline" onMouseEnter={onEnter} onMouseLeave={onLeave}>Conocer el modelo →</a>
        </div>
        <div className="hero-stats">
          <div className="stat-item"><div className="stat-num">+<Counter to={120} /></div><div className="stat-label">Proyectos Ejecutados</div></div>
          <div className="stat-item"><div className="stat-num"><Counter to={98} />%</div><div className="stat-label">Satisfacción de Clientes</div></div>
          <div className="stat-item"><div className="stat-num"><Counter to={15} />+</div><div className="stat-label">Años en el Sector</div></div>
        </div>
      </div>
    </section>
  );
}
