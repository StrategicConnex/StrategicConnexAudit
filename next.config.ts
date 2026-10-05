import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

// NOTE: `output: "standalone"` removed deliberately — deploying to Vercel.
// Vercel's lambda builder (Next.js Build Output API) natively emits per-route
// serverless functions; `standalone` is only needed for Docker/self-hosting
// and can conflict with Vercel's lambda tracing (intermittent
// "Unable to find lambda for route" build failures observed on this project).
const nextConfig: NextConfig = {
  // Sin remotePatterns: la app no carga imágenes remotas vía el optimizador
  // de next/image (el logo es local; el branding de PDFs usa @react-pdf,
  // que no pasa por este pipeline). El wildcard hostname:"**" era superficie
  // de ataque sin uso legítimo.
  images: {},
  // /docs/[...slug] renders the markdown from docs/ at REQUEST time (dynamic
  // rendering is required so the CSP nonce applies — see src/proxy.ts), so the
  // markdown files must ship inside the serverless function bundle.
  outputFileTracingIncludes: {
    "/docs/[...slug]": ["./docs/**/*"],
  },
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "mermaid",
      "three",
      "leaflet",
      "@react-pdf/renderer",
    ],
  },
  async headers() {
    return [
      {
        // SEO / crawler directives — NOT security; security headers
        // are applied dynamically by src/middleware.ts with a per-request
        // CSP nonce, HSTS, XFO, XCTO, Referrer-Policy, and Permissions-Policy.
        source: "/(.*)",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "index, follow",
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "strategic-connex",

  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
