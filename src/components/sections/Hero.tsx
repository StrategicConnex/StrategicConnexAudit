"use client";
import React from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Counter } from "../ui/Counter";

export function Hero({ onEnter, onLeave }) {
  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 1000], [0, 350]);

  return (
    <section id="hero">
      <motion.div className="hero-bg" aria-hidden={true} style={{ y: heroY }}>
        <div className="hero-grid"></div>
        <div className="hero-glow"></div>
        <div className="hero-glow2"></div>
        <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" opacity=".18">
          <defs>
            <linearGradient id="lg1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: "#D4AF37", stopOpacity: ".6" }} />
              <stop offset="100%" style={{ stopColor: "#2563EB", stopOpacity: ".3" }} />
            </linearGradient>
          </defs>
          <circle cx="200" cy="150" r="4" fill="#D4AF37" /><circle cx="450" cy="80" r="3" fill="#D4AF37" />
          <circle cx="700" cy="200" r="5" fill="#D4AF37" /><circle cx="950" cy="120" r="3" fill="#2563EB" />
          <circle cx="1100" cy="300" r="4" fill="#D4AF37" /><circle cx="320" cy="350" r="3" fill="#2563EB" />
          <circle cx="580" cy="450" r="6" fill="#D4AF37" /><circle cx="820" cy="380" r="3" fill="#D4AF37" />
          <circle cx="100" cy="500" r="4" fill="#2563EB" /><circle cx="1050" cy="550" r="5" fill="#D4AF37" />
          <line x1="200" y1="150" x2="450" y2="80" stroke="#D4AF37" strokeWidth=".8" />
          <line x1="450" y1="80" x2="700" y2="200" stroke="#D4AF37" strokeWidth=".8" />
          <line x1="700" y1="200" x2="950" y2="120" stroke="#2563EB" strokeWidth=".8" />
          <line x1="950" y1="120" x2="1100" y2="300" stroke="#D4AF37" strokeWidth=".8" />
          <line x1="200" y1="150" x2="320" y2="350" stroke="#2563EB" strokeWidth=".6" />
          <line x1="320" y1="350" x2="580" y2="450" stroke="#D4AF37" strokeWidth=".8" />
          <line x1="580" y1="450" x2="820" y2="380" stroke="#D4AF37" strokeWidth=".8" />
          <line x1="700" y1="200" x2="580" y2="450" stroke="#D4AF37" strokeWidth=".6" />
          <line x1="100" y1="500" x2="320" y2="350" stroke="#2563EB" strokeWidth=".6" />
          <line x1="820" y1="380" x2="1050" y2="550" stroke="#D4AF37" strokeWidth=".8" />
          <line x1="1100" y1="300" x2="1050" y2="550" stroke="#D4AF37" strokeWidth=".6" />
          <rect x="60" y="620" width="120" height="2" fill="#D4AF37" opacity=".4" />
          <rect x="200" y="640" width="80" height="2" fill="#2563EB" opacity=".4" />
          <rect x="900" y="700" width="150" height="2" fill="#D4AF37" opacity=".4" />
          <polygon points="580,420 610,470 550,470" fill="none" stroke="#D4AF37" strokeWidth="1" opacity=".5" />
          <rect x="820" y="350" width="30" height="30" fill="none" stroke="#D4AF37" strokeWidth="1" opacity=".4" />
        </svg>
      </motion.div>
      <div className="hero-content">
        <div className="hero-badge">🔶 PLATAFORMA DE INTELIGENCIA COMERCIAL</div>
        <h1 className="hero-title">Control Total.<br /><span className="accent">Estrategia Precisa.</span>Resultados Reales.</h1>
        <p className="hero-sub">La única Consultora Integral en Neuquén que fusiona Marketing B2B, Control Documental e IT para el Sector Energético. Strategic Connex redefine el estándar de crecimiento para las Pymes de la Cuenca Neuquina. Somos la única consultora en Neuquén Capital que integra en una sola estructura el marketing estratégico, el posicionamiento comercial B2B y la gestión documental técnica. Nuestra misión es clara: profesionalizar a las empresas de servicios de Oil & Gas para que dominen el mercado en Vaca Muerta. Hablamos el idioma de la industria y transformamos su infraestructura digital y operativa en un activo de alto rendimiento, garantizando que su empresa no solo sea visible, sino que sea la primera opción para las grandes operadoras.</p>
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
