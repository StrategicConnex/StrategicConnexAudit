'use client';

import dynamic from 'next/dynamic';

/**
 * Client-side lazy loader for Swagger UI.
 *
 * Lives in its own client component so `ssr:false` works: per the Next.js
 * docs, `ssr:false`/`loading` are client-only options for `next/dynamic`.
 * Rendering this loader from the RSC /swagger page keeps the ~3MB
 * swagger-ui-react chunk OUT of the route's initial HTML — it only downloads
 * after hydration, with a skeleton shown meanwhile.
 */
const SwaggerClient = dynamic(() => import('./SwaggerClient'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-32">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="text-sm text-muted-fg">Loading API documentation…</p>
      </div>
    </div>
  ),
});

export default function SwaggerLazyLoader() {
  return <SwaggerClient />;
}
