"use client";
import React from "react";
import { FadeUp } from "../ui/FadeUp";
import { Counter } from "../ui/Counter";

export function KPI() {
  return (
    <section id="kpi">
      <FadeUp style={{ textAlign: "center" }}>
        <span className="section-label">▸ Desempeño</span>
        <h2 className="section-title">Resultados que Hablan por Sí Solos</h2>
        <div className="divider" style={{ margin: "1.25rem auto" }}></div>
      </FadeUp>
      <FadeUp className="kpi-bar" delay={0.2}>
        <div className="kpi-item"><div className="kpi-value"><span className="kpi-unit">+</span><Counter to={340} /></div><div className="kpi-desc">Crecimiento promedio en visibilidad orgánica</div><div className="kpi-trend">↑ 12% vs año anterior</div></div>
        <div className="kpi-item"><div className="kpi-value"><Counter to={4.8} isFloat={true} /><span className="kpi-unit">x</span></div><div className="kpi-desc">Retorno sobre inversión en campañas SEM</div><div className="kpi-trend">↑ 8% vs año anterior</div></div>
        <div className="kpi-item"><div className="kpi-value"><span className="kpi-unit">+</span><Counter to={87} /></div><div className="kpi-desc">Documentos técnicos homologados entregados</div><div className="kpi-trend">↑ 23% vs año anterior</div></div>
        <div className="kpi-item"><div className="kpi-value"><Counter to={98} /><span className="kpi-unit">%</span></div><div className="kpi-desc">Índice de satisfacción de clientes corporativos</div><div className="kpi-trend">↑ Sostenido</div></div>
      </FadeUp>
    </section>
  );
}
