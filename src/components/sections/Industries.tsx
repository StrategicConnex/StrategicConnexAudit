"use client";
import React from "react";
import { FadeUp } from "../ui/FadeUp";
import { HoverImage3D } from "../ui/HoverImage3D";
import { useCursorStore } from "@/lib/store/useCursorStore";

export function Industries() {
  const setHovering = useCursorStore((state) => state.setHovering);

  return (
    <section id="industries">
      <div className="industries-bg" aria-hidden={true}></div>
      <div className="ind-grid-bg" aria-hidden={true}></div>
      <div className="industries-content">
        <FadeUp>
          <span className="section-label">▸ Industrias</span>
          <h2 className="section-title">Enfocados en Sectores de Alta Complejidad en la Cuenca Neuquina</h2>
          <div className="divider"></div>
          <p className="section-desc">Nuestra experiencia está concentrada en Añelo y el corazón de Vaca Muerta, ofreciendo Servicios Especializados para la industria del Oil & Gas, donde la precisión técnica y la credibilidad corporativa son factores críticos de éxito.</p>
        </FadeUp>
        <div className="industry-cards">
          <FadeUp 
            delay={0.1} 
            className="ind-card" 
            onMouseEnter={() => setHovering(true)} 
            onMouseLeave={() => setHovering(false)}
          >
            <div className="ind-card-bg">
              <HoverImage3D 
                src="/images/industry_oil_gas.webp" 
                alt="Operaciones de exploración de petróleo y gas natural en Vaca Muerta, Añelo" 
                className="ind-img" 
              />
            </div>
            <div className="ind-card-overlay"></div>
            <div className="ind-card-content">
              <div className="ind-badge">SECTOR PRIMARIO</div>
              <h3>Oil & Gas</h3>
              <p>Estrategia comercial, homologación y posicionamiento para empresas del sector energético y extractivo.</p>
            </div>
          </FadeUp>
          <FadeUp 
            delay={0.2} 
            className="ind-card" 
            onMouseEnter={() => setHovering(true)} 
            onMouseLeave={() => setHovering(false)}
          >
            <div className="ind-card-bg">
              <HoverImage3D 
                src="/images/industry_energy.webp" 
                alt="Infraestructura de distribución eléctrica industrial y utilities para empresas en Neuquén" 
                className="ind-img" 
              />
            </div>
            <div className="ind-card-overlay"></div>
            <div className="ind-card-content">
              <div className="ind-badge">ENERGÍA</div>
              <h3>Energía & Utilities</h3>
              <p>Comunicación estratégica y marketing B2B para empresas del sector energético y de servicios públicos.</p>
            </div>
          </FadeUp>
          <FadeUp 
            delay={0.3} 
            className="ind-card" 
            onMouseEnter={() => setHovering(true)} 
            onMouseLeave={() => setHovering(false)}
          >
            <div className="ind-card-bg">
              <HoverImage3D 
                src="/images/industry_infra.webp" 
                alt="Maquinaria vial y obras de infraestructura civil e ingeniería en yacimientos de la Cuenca Neuquina" 
                className="ind-img" 
              />
            </div>
            <div className="ind-card-overlay"></div>
            <div className="ind-card-content">
              <div className="ind-badge">CONSTRUCCIÓN</div>
              <h3>Infraestructura e Ingeniería</h3>
              <p>Documentación técnica, licitaciones y gestión comercial para empresas constructoras e ingeniería civil.</p>
            </div>
          </FadeUp>
        </div>
      </div>
    </section>
  );
}
