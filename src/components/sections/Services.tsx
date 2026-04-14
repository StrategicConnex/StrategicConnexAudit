"use client";
import React from "react";
import Image from "next/image";
import { FadeUp } from "../ui/FadeUp";

export function Services() {
  const servicios = [
    { img: "marketing_digital_1775961023662.png", title: "Marketing Industrial & Desarrollo de Proveedores", desc: "Estrategias digitales integrales orientadas a resultados medibles y crecimiento sostenido de marca.", tag: "Núcleo estratégico" },
    { img: "estrategia_consultoria_1775961038052.png", title: "Estrategia y Consultoría", desc: "Análisis de mercado, posicionamiento competitivo y hoja de ruta estratégica para sectores industriales.", tag: "Diagnóstico y planificación" },
    { img: "key_visual_contenido_1775961052376.png", title: "Key Visual y Contenido", desc: "Identidad visual estratégica y producción de contenido de alto impacto alineado con los objetivos corporativos.", tag: "Marca y comunicación" },
    { img: "seo_tecnico_1775961065623.png", title: "SEO Técnico y Semántico", desc: "Optimización avanzada para motores de búsqueda con enfoque en industria B2B y mercados de nicho.", tag: "Visibilidad orgánica" },
    { img: "publicidad_online_1775961079546.png", title: "Publicidad Online (SEM/PPC)", desc: "Campañas pagadas de alta precisión con gestión de presupuesto orientada al ROI en sectores industriales.", tag: "Captación de leads" },
    { img: "redes_sociales_1775961095750.png", title: "Redes Sociales", desc: "Gestión estratégica de presencia digital corporativa con enfoque B2B y construcción de autoridad sectorial.", tag: "Presencia corporativa" },
    { img: "marketing_contenidos_1775961111176.png", title: "Marketing de Contenidos", desc: "Producción de contenido técnico especializado que genera credibilidad y atrae a tomadores de decisión.", tag: "Autoridad de nicho" },
    { img: "analitica_reportes_1775961126189.png", title: "Analítica y Reportes", desc: "Tableros de control personalizados, análisis de datos y reportes ejecutivos para toma de decisiones.", tag: "Inteligencia de negocio" },
    { img: "branding_corporativo_1775961139844.png", title: "Branding Corporativo", desc: "Desarrollo y consolidación de identidad de marca para empresas operando en mercados de alta exigencia.", tag: "Posicionamiento" },
    { img: "diseno_web_1775961152123.png", title: "Diseño y Desarrollo Web", desc: "Plataformas digitales de alto rendimiento con experiencia de usuario premium y arquitectura escalable.", tag: "Presencia digital" },
  ];

  return (
    <section id="services">
      <FadeUp className="services-header">
        <span className="section-label">▸ Servicios</span>
        <h2 className="section-title">La única Suite Integral de Soluciones para el Sector Energético en Neuquén</h2>
        <div className="divider"></div>
        <p className="section-desc">Strategic Connex ofrece la única suite de servicios en la Cuenca Neuquina que resuelve, en un solo lugar, las necesidades críticas de comunicación y operación de las Pymes industriales.</p>
      </FadeUp>
      <div className="services-grid">
        {servicios.map((srv, i) => (
          <FadeUp key={i} className="service-card" delay={0.05 * i}>
            <div className="service-img">
              <Image src={`/images/${srv.img}`} alt={srv.title} width={400} height={200} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div className="service-content">
              <h3>{srv.title}</h3>
              <p>{srv.desc}</p>
              <span className="service-tag">▹ {srv.tag}</span>
            </div>
          </FadeUp>
        ))}
      </div>
    </section>
  );
}
