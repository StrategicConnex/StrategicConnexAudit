export const heroMetrics = [
  {
    id: "proyectos",
    value: 120,
    prefix: "+",
    suffix: "",
    label: "Proyectos Ejecutados",
  },
  {
    id: "satisfaccion",
    value: 98,
    prefix: "",
    suffix: "%",
    label: "Satisfacción de Clientes",
  },
  {
    id: "experiencia",
    value: 15,
    prefix: "",
    suffix: "+",
    label: "Años en el Sector",
  },
];

export const dashboardStateLabels = [
  { id: "art", text: "Vencimientos ART", bg: "var(--blue)", color: "#fff", border: "none" },
  { id: "inducciones", text: "Inducciones aprobadas", bg: "#10B981", color: "#fff", border: "none" },
  { id: "flota", text: "Documentación de flota", bg: "var(--gold)", color: "#000", border: "none" },
  { id: "homologacion", text: "Estado de Homologación", bg: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid var(--border)" },
];

export const dashboardKpis = [
  { id: "trafico", label: "Tráfico Orgánico", value: 24850, isFloat: false, suffix: "", trend: "↑9%" },
  { id: "leads", label: "Leads Generados", value: 312, isFloat: false, suffix: "", trend: "↑17%" },
  { id: "roi", label: "ROI Campañas", value: 4.8, isFloat: true, suffix: "x", trend: "↑5%" },
];

export const dashboardChartData = {
  monthlyPerformance: [45, 60, 52, 75, 68, 90, 82],
  activeMonthIndex: 5,
  conversionTarget: 72,
};

export const dashboardAlerts = [
  { id: "alert-1", type: "warn", icon: "⚠", text: "Campaña SEM — Presupuesto al 80% del límite mensual" },
  { id: "alert-2", type: "ok", icon: "✓", text: "Ficha técnica Proyecto Norte aprobada y homologada" },
  { id: "alert-3", type: "info", icon: "ℹ", text: "Nuevo informe de analítica disponible para revisión" },
];
