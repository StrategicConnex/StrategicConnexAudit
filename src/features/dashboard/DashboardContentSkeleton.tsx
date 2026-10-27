/**
 * Fallback del `<Suspense>` que vive DENTRO del DashboardShell (H-10b F-C).
 *
 * A diferencia de `DashboardSkeleton` (pantalla completa, para los loading.tsx
 * de otras rutas), este skeleton va en el área de contenido que ya está
 * rodeada por el chrome real — sidebar, header y el hero con el h2 fijo.
 *
 * Mantiene el texto "Cargando tu portafolio…" del F-B: es el marcador que
 * `scripts/e2e/lcp-diag.mjs` usa para confirmar que el build nuevo está en
 * prod, y sin texto real el fallback no sería contentful.
 */
export function DashboardContentSkeleton() {
  return (
    <div data-testid="dashboard-content-skeleton" className="space-y-6 animate-pulse">
      <div className="bg-card border border-border/50 rounded-xl p-6">
        <p className="text-sm font-bold text-foreground">Cargando tu portafolio…</p>
      </div>

      {/* KPI Stats Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-40 w-full bg-card border border-border/50 rounded-xl" />
        ))}
      </div>

      {/* Content Area Skeleton */}
      <div className="h-[500px] w-full bg-card border border-border/50 rounded-xl" />
    </div>
  );
}
