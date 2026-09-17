import Link from "next/link";
import { Check } from "lucide-react";
import { directDb } from "@/shared/db";
import { subscriptionPlans } from "@/shared/db/schemas";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Planes — StrategicAudit Pro",
  description: "Planes y precios de StrategicAudit Pro.",
};

interface PlanView {
  name: string;
  maxProjects: number;
  maxKeywords: number;
  seats: number;
  whiteLabel: boolean;
  apiAccess: boolean;
  priceMonthly: string | null;
}

function toView(p: typeof subscriptionPlans.$inferSelect): PlanView {
  const features = (p.features ?? {}) as {
    seats?: number;
    whiteLabel?: boolean;
    apiAccess?: boolean;
  };
  return {
    name: p.name,
    maxProjects: p.maxProjects,
    maxKeywords: p.maxKeywords,
    seats: typeof features.seats === "number" ? features.seats : 1,
    whiteLabel: features.whiteLabel === true,
    apiAccess: features.apiAccess === true,
    priceMonthly: p.priceMonthly,
  };
}

/**
 * GET /pricing — tabla pública de planes desde la BD (A-4).
 * Sin checkout falso: Free arranca con registro; Enterprise por contacto.
 */
export default async function PricingPage() {
  let plans: PlanView[] = [];
  try {
    const rows = await directDb.query.subscriptionPlans.findMany({
      orderBy: [asc(subscriptionPlans.priceMonthly)],
    });
    plans = rows.map(toView);
  } catch {
    plans = [];
  }

  return (
    <div className="min-h-dvh w-full bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="text-center space-y-3 mb-12">
          <p className="text-2xs font-extrabold uppercase tracking-widest text-primary">Planes</p>
          <h1 className="font-display text-4xl sm:text-5xl font-black tracking-tight">
            Precios simples, sin sorpresas
          </h1>
          <p className="text-sm text-muted-fg max-w-xl mx-auto">
            Empieza gratis. Sube de plan cuando tus proyectos lo pidan.
          </p>
        </div>

        {plans.length === 0 ? (
          <p className="text-center text-sm text-muted-fg">
            Los planes no están disponibles ahora mismo. Escríbenos y te contamos.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan) => (
              <div key={plan.name} className="glass-card p-8 flex flex-col gap-6">
                <div>
                  <h2 className="text-lg font-extrabold tracking-tight capitalize">{plan.name}</h2>
                  <p className="mt-2">
                    {plan.priceMonthly === null ? (
                      <span className="text-3xl font-black">Contacto</span>
                    ) : (
                      <>
                        <span className="text-3xl font-black">
                          ${Number(plan.priceMonthly) === 0 ? "0" : Number(plan.priceMonthly)}
                        </span>
                        <span className="text-2xs text-muted-fg"> /mes</span>
                      </>
                    )}
                  </p>
                </div>
                <ul className="space-y-2.5 text-sm text-muted-fg flex-1">
                  <li className="flex items-center gap-2">
                    <Check aria-hidden="true" className="w-4 h-4 text-chartreuse shrink-0" />
                    {plan.maxProjects} proyecto{plan.maxProjects === 1 ? "" : "s"}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check aria-hidden="true" className="w-4 h-4 text-chartreuse shrink-0" />
                    {plan.maxKeywords.toLocaleString()} keywords
                  </li>
                  <li className="flex items-center gap-2">
                    <Check aria-hidden="true" className="w-4 h-4 text-chartreuse shrink-0" />
                    {plan.seats} asiento{plan.seats === 1 ? "" : "s"}
                  </li>
                  {plan.apiAccess && (
                    <li className="flex items-center gap-2">
                      <Check aria-hidden="true" className="w-4 h-4 text-chartreuse shrink-0" />
                      Acceso API
                    </li>
                  )}
                  {plan.whiteLabel && (
                    <li className="flex items-center gap-2">
                      <Check aria-hidden="true" className="w-4 h-4 text-chartreuse shrink-0" />
                      Marca blanca
                    </li>
                  )}
                </ul>
                {plan.priceMonthly === null ? (
                  <a
                    href="mailto:contacto@strategicaudit.pro?subject=Plan%20Enterprise"
                    className="text-center px-6 py-2.5 rounded-xl border border-border text-2xs font-extrabold uppercase tracking-widest hover:border-primary/40 transition-colors"
                  >
                    Contactar
                  </a>
                ) : (
                  <Link
                    href="/login"
                    className="text-center px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-2xs font-extrabold uppercase tracking-widest hover:bg-primary/90 transition-colors"
                  >
                    {Number(plan.priceMonthly) === 0 ? "Empezar gratis" : "Elegir plan"}
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="text-center mt-10">
          <Link href="/" className="text-sm text-primary hover:underline">
            Volver al inicio
          </Link>
        </p>
      </div>
    </div>
  );
}
