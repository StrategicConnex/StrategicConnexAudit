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
        <div className="hero-badge"><span style={{color: '#f05252', fontSize: '10px'}}>♦</span> AGENCIA SEO & CRECIMIENTO ORGÁNICO</div>
        <h1 className="main-title">
          Posicionamiento Web Estratégico para Empresas
        </h1>
        <p className="hero-sub" style={{ marginTop: '2rem' }}>
          Aumentamos tu visibilidad en Google con estrategias SEO técnicas, contenido optimizado y arquitectura digital orientada a resultados.
        </p>
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
