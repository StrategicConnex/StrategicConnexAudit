import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
    /**
     * Enables View Transitions API for client-side <Link> navigations.
     * Every navigation is wrapped in document.startViewTransition, so the
     * ::view-transition-old/new(root) CSS in globals.css plays the page
     * enter + exit animations on route changes.
     */
    viewTransition: true,
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
