import { redirect } from "next/navigation";
import { createClient } from "@/shared/lib/supabase/server";
import { requireAdmin } from "@/server/auth/admin";
import { UsageDashboardLazy } from "./usage-dashboard.client";
import { getUsageMetrics, getUsageDailyAudits } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Panel de uso — StrategicAudit Pro",
  description: "Métricas de uso de la plataforma (Q4 6.5).",
};

export default async function UsagePage() {
  // 1. Auth guard — patrón /ai/health/page.tsx: solo usuarios autenticados.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // 2. Role gate — un no-admin ve denegación, no un 500 del error boundary
  //    (las actions usan assertPlatformAdmin como 2ª capa).
  const gate = await requireAdmin();
  if (!gate.ok) {
    return (
      <main className="p-6 text-sm text-muted-foreground">
        Acceso denegado: el panel de uso requiere rol admin de plataforma.
      </main>
    );
  }

  // 3. Fetch in paralelo.
  const [metrics, daily] = await Promise.all([getUsageMetrics(), getUsageDailyAudits()]);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Panel de uso de la plataforma</h1>
      <UsageDashboardLazy metrics={metrics} daily={daily} />
    </main>
  );
}
