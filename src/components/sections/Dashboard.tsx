"use client";
import React, { useState } from "react";
import { motion } from "framer-motion";
import { FadeUp } from "../ui/FadeUp";
import { Counter } from "../ui/Counter";
import { 
  dashboardStateLabels, 
  dashboardKpis, 
  dashboardChartData, 
  dashboardAlerts 
} from "@/constants/metrics";

export function Dashboard() {
  const [activeTab, setActiveTab] = useState("Dashboard");

  const navItems = [
    { id: "Dashboard", label: "⬡ Dashboard" },
    { id: "Analitica", label: "📈 Analítica" },
    { id: "Campanas", label: "🎯 Campañas" },
    { id: "Documentos", label: "📄 Documentos" },
    { id: "Estrategia", label: "⚙️ Estrategia" },
    { id: "Alertas", label: "🔔 Alertas" },
    { id: "Reportes", label: "📊 Reportes" },
    { id: "Configuracion", label: "⚙ Configuración" }
  ];

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
            {navItems.map(item => (
              <li key={item.id} className={activeTab === item.id ? "active" : ""}>
                <button 
                  onClick={() => setActiveTab(item.id)}
                  aria-current={activeTab === item.id ? "page" : undefined}
                  type="button"
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="dash-main">
          <div className="dash-topbar">
            <h4>Vista General — Q2</h4>
            <div className="dash-status">Sistema activo</div>
          </div>
          <div className="dash-state-labels" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', padding: '0 1.5rem' }}>
            {dashboardStateLabels.map((label) => (
              <span key={label.id} style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', background: label.bg, color: label.color, borderRadius: '4px', border: label.border }}>
                {label.text}
              </span>
            ))}
          </div>
          <div className="dash-kpis">
            {dashboardKpis.map((kpi) => (
              <div key={kpi.id} className="dash-kpi">
                <div className="dash-kpi-label">{kpi.label}</div>
                <div className="dash-kpi-val">
                  <Counter to={kpi.value} isFloat={kpi.isFloat} />{kpi.suffix} <span>{kpi.trend}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="dash-charts">
            <div className="dash-chart">
              <div className="dash-chart-title">Rendimiento Mensual</div>
              <div className="chart-bars">
                {dashboardChartData.monthlyPerformance.map((h, i) => (
                  <motion.div key={i} className={`bar ${i === dashboardChartData.activeMonthIndex ? 'active' : ''}`} initial={{ height: 0 }} whileInView={{ height: `${h}%` }} viewport={{ once: true }} transition={{ duration: 1, delay: i * 0.1 }} />
                ))}
              </div>
            </div>
            <div className="dash-chart">
              <div className="dash-chart-title">Conversión</div>
              <motion.div className="donut" initial={{ background: "conic-gradient(var(--gold) 0% 0%, rgba(255,255,255,.06) 0% 100%)" }} whileInView={{ background: `conic-gradient(var(--gold) 0% ${dashboardChartData.conversionTarget}%, rgba(255,255,255,.06) ${dashboardChartData.conversionTarget}% 100%)` }} viewport={{ once: true }} transition={{ duration: 1.5, delay: 0.5 }}>
                <div className="donut-inner"></div>
              </motion.div>
              <div style={{ textAlign: "center", marginTop: ".75rem", fontSize: ".72rem", color: "var(--text-muted)" }}>{dashboardChartData.conversionTarget}% objetivo alcanzado</div>
            </div>
          </div>
          <div className="dash-alerts">
            {dashboardAlerts.map((alert) => (
              <div key={alert.id} className={`alert-item alert-${alert.type}`}>
                {alert.icon} {alert.text}
              </div>
            ))}
          </div>
        </div>
      </FadeUp>
    </section>
  );
}
