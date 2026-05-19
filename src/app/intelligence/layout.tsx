import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Redes & Threat Intelligence Cockpit | StrategicAudit Pro",
  description: "Auditoría activa y pasiva avanzada de redes, records DNS y seguridad perimetral.",
};

export default function IntelligenceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#09090b] selection:bg-emerald-500/20 antialiased">
      {children}
    </div>
  );
}
