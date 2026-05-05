"use client";
import React from "react";
import { motion } from "framer-motion";
import { Counter } from "../ui/Counter";
import { heroMetrics } from "@/constants/metrics";
import { useCursorStore } from "@/lib/store/useCursorStore";

export function Hero() {
  const setHovering = useCursorStore((state) => state.setHovering);

  return (
    <section id="hero">
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
          <a 
            href="#services" 
            className="btn-primary" 
            onMouseEnter={() => setHovering(true)} 
            onMouseLeave={() => setHovering(false)}
          >
            ▶ Explorar Servicios
          </a>
          <a 
            href="#about" 
            className="btn-outline" 
            onMouseEnter={() => setHovering(true)} 
            onMouseLeave={() => setHovering(false)}
          >
            Conocer el modelo →
          </a>
        </div>
        <div className="hero-stats">
          {heroMetrics.map((metric) => (
            <div key={metric.id} className="stat-item">
              <div className="stat-num">
                {metric.prefix}<Counter to={metric.value} />{metric.suffix}
              </div>
              <div className="stat-label">{metric.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
