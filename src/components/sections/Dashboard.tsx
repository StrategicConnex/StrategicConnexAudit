"use client";
import React from "react";
import { motion } from "framer-motion";
import { FadeUp } from "../ui/FadeUp";
import { Counter } from "../ui/Counter";

export function Dashboard() {
  return (
    <section id="dashboard">
      <FadeUp>
        <span className="section-label">▸ Plataforma de Control</span>
        <h2 className="section-title">Panel de Inteligencia Estratégica</h2>
        <div className="divider"></div>
        <p className="section-desc">Nuestros clientes acceden a un entorno de control centralizado donde monitorean cada métrica de su estrategia en tiempo real.</p>
      </FadeUp>
      <FadeUp className="dash-wrapper" delay={0.2}>
        <div className="dash-sidebar">
          <div className="dash-logo">SC PLATFORM</div>
          <ul className="dash-nav">
            <li className="active"><a href="#">⬡ Dashboard</a></li>
            <li><a href="#">📈 Analítica</a></li>
            <li><a href="#">🎯 Campañas</a></li>
            <li><a href="#">📄 Documentos</a></li>
            <li><a href="#">⚙️ Estrategia</a></li>
            <li><a href="#">🔔 Alertas</a></li>
            <li><a href="#">📊 Reportes</a></li>
            <li><a href="#">⚙ Configuración</a></li>
          </ul>
        </div>
        <div className="dash-main">
          <div className="dash-topbar">
            <h4>Vista General — Q2</h4>
            <div className="dash-status">Sistema activo</div>
          </div>
          <div className="dash-state-labels" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', padding: '0 1.5rem' }}>
            <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', background: 'var(--blue)', color: '#fff', borderRadius: '4px' }}>Vencimientos ART</span>
            <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', background: '#10B981', color: '#fff', borderRadius: '4px' }}>Inducciones aprobadas</span>
            <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', background: 'var(--gold)', color: '#000', borderRadius: '4px' }}>Documentación de flota</span>
            <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', background: 'rgba(255,255,255,0.1)', border: '1px solid var(--border)', borderRadius: '4px' }}>Estado de Homologación</span>
          </div>
          <div className="dash-kpis">
            <div className="dash-kpi"><div className="dash-kpi-label">Tráfico Orgánico</div><div className="dash-kpi-val"><Counter to={24850} /> <span>↑9%</span></div></div>
            <div className="dash-kpi"><div className="dash-kpi-label">Leads Generados</div><div className="dash-kpi-val"><Counter to={312} /> <span>↑17%</span></div></div>
            <div className="dash-kpi"><div className="dash-kpi-label">ROI Campañas</div><div className="dash-kpi-val"><Counter to={4.8} isFloat={true} />x <span>↑5%</span></div></div>
          </div>
          <div className="dash-charts">
            <div className="dash-chart">
              <div className="dash-chart-title">Rendimiento Mensual</div>
              <div className="chart-bars">
                {[45, 60, 52, 75, 68, 90, 82].map((h, i) => (
                  <motion.div key={i} className={`bar ${i === 5 ? 'active' : ''}`} initial={{ height: 0 }} whileInView={{ height: `${h}%` }} viewport={{ once: true }} transition={{ duration: 1, delay: i * 0.1 }} />
                ))}
              </div>
            </div>
            <div className="dash-chart">
              <div className="dash-chart-title">Conversión</div>
              <motion.div className="donut" initial={{ background: "conic-gradient(var(--gold) 0% 0%, rgba(255,255,255,.06) 0% 100%)" }} whileInView={{ background: "conic-gradient(var(--gold) 0% 72%, rgba(255,255,255,.06) 72% 100%)" }} viewport={{ once: true }} transition={{ duration: 1.5, delay: 0.5 }}>
                <div className="donut-inner"></div>
              </motion.div>
              <div style={{ textAlign: "center", marginTop: ".75rem", fontSize: ".72rem", color: "var(--text-muted)" }}>72% objetivo alcanzado</div>
            </div>
          </div>
          <div className="dash-alerts">
            <div className="alert-item alert-warn">⚠ Campaña SEM — Presupuesto al 80% del límite mensual</div>
            <div className="alert-item alert-ok">✓ Ficha técnica Proyecto Norte aprobada y homologada</div>
            <div className="alert-item alert-info">ℹ Nuevo informe de analítica disponible para revisión</div>
          </div>
        </div>
      </FadeUp>
    </section>
  );
}
