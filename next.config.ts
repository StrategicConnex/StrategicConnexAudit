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
    optimizePackageImports: ["lucide-react"],
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

export default nextConfig;
