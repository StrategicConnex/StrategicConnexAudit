"use client";
import React from "react";
import Image from "next/image";
import { FadeUp } from "../ui/FadeUp";
import { SERVICIOS_DATA } from "../../constants/data";

export function Services() {
  return (
    <section id="services" style={{ position: "relative", overflow: "hidden" }}>
      <FadeUp className="services-header" style={{ position: "relative", zIndex: 1 }}>
        <span className="section-label">▸ Servicios</span>
        <h2 className="section-title">La única Suite Integral de Soluciones para el Sector Energético en Neuquén</h2>
        <div className="divider"></div>
        <p className="section-desc">Strategic Connex ofrece la única suite de servicios en la Cuenca Neuquina que resuelve, en un solo lugar, las necesidades críticas de comunicación y operación de las Pymes industriales.</p>
      </FadeUp>
      <div className="services-grid" style={{ position: "relative", zIndex: 1 }}>
        {SERVICIOS_DATA.map((srv, i) => (
          <FadeUp key={i} className="service-card" delay={0.05 * i}>
            <div className="service-img" style={{ position: "relative" }}>
              <Image 
                src={`/images/${srv.img}`} 
                alt={srv.alt} 
                fill 
                className="object-cover" 
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                loading="lazy"
              />
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
