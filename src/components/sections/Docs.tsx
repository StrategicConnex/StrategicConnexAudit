"use client";
import React from "react";
import { FadeUp } from "../ui/FadeUp";

export function Docs() {
  return (
    <section id="docs">
      <FadeUp>
        <span className="section-label">▸ Documentación Técnica</span>
        <h2 className="section-title">Gestión Documental Estratégica</h2>
        <div className="divider"></div>
        <p className="section-desc">Producimos y gestionamos documentación técnica y comercial de precisión, adaptada a los estándares exigidos por el sector energético e industrial.</p>
      </FadeUp>
      <div className="docs-grid">
        <FadeUp className="doc-card" delay={0}>
          <div className="doc-header"><div className="doc-icon">⚙️</div><div className="doc-number">01</div></div>
          <h3>Ingeniería y Gestión</h3>
          <p>Elaboración de documentación técnica integral bajo normativas internacionales.</p>
          <ul className="doc-features"><li>Memoria técnica</li><li>Especificaciones</li><li>ISO</li></ul>
        </FadeUp>
        <FadeUp className="doc-card" delay={0.1}>
          <div className="doc-header"><div className="doc-icon">📑</div><div className="doc-number">02</div></div>
          <h3>Gestión de Legajos para Operadoras (YPF, PAE, Vista, Chevron)</h3>
          <p>Fichas certificadas y estructuradas para operadoras del sector Oil & Gas.</p>
          <ul className="doc-features"><li>Formato operadoras</li><li>Trazabilidad</li><li>Aprobaciones</li></ul>
        </FadeUp>
        <FadeUp className="doc-card" delay={0.2}>
          <div className="doc-header"><div className="doc-icon">📊</div><div className="doc-number">03</div></div>
          <h3>Presupuesto Inteligente</h3>
          <p>Propuestas económicas visuales orientadas a aumentar el porcentaje de cierre B2B.</p>
          <ul className="doc-features"><li>Diseño corporativo</li><li>Pricing dinámico</li><li>PDF / Editable</li></ul>
        </FadeUp>
        <FadeUp className="doc-card" delay={0.3}>
          <div className="doc-header"><div className="doc-icon">🛡️</div><div className="doc-number">04</div></div>
          <h3>Acreditación de Personal y Vehículos para Yacimientos</h3>
          <p>Gestión y trazabilidad pura para auditorías y sistemas de control de calidad.</p>
          <ul className="doc-features"><li>Codificación</li><li>Revisiones históricas</li><li>Repositorio</li></ul>
        </FadeUp>
      </div>
    </section>
  );
}
