import { NextRequest } from "next/server";
import { updateSession } from "@/shared/lib/supabase/middleware";

/* ═══════════════════════════════════════════════════════════════════
   SCAUDIT — Global Proxy (Next.js 16, replaces middleware.ts)
   
   Applies per-request security headers including a Content-Security-
   Policy with a unique nonce. Integrates with Supabase auth session
   management for route protection.
   
   NOTE: In Next.js 16, the middleware.ts convention is deprecated.
   The file must be named proxy.ts and export a default "proxy" function.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Generates a Content-Security-Policy header string.
 * The nonce is generated per-request and passed via x-csp-nonce
 * request header for SSR layouts to read; however, Next.js App Router
 * does not assign nonces to its own <script> tags, so script-src uses
 * 'self' + 'unsafe-inline' (Next.js requirement) + 'strict-dynamic'.
 */
function buildCsp(): string {
  const directives = [
    `default-src 'self'`,
    // Scripts: self (Next.js bundles) + unsafe-inline (Next.js inline hydration).
    // NOTE: 'strict-dynamic' is intentionally OMITTED because Next.js App Router
    // loads chunk scripts via dynamic import() on 'self' origins, and
    // 'strict-dynamic' overrides host-based allowlisting, breaking chunk loading.
    // unsafe-eval is required by React DevTools in development mode.
    `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
    // Styles: Next.js injects inline styles for CSS-in-JS / CSS modules
    `style-src 'self' 'unsafe-inline'`,
    // Images: allow data: URIs (inline images) and HTTPS (external images)
    `img-src 'self' data: https:`,
    // Fonts: allow data: URIs (icon fonts) and self-hosted
    `font-src 'self' data:`,
    // Connections: Supabase for auth / DB, Vercel for deployment APIs
    `connect-src 'self' https://*.supabase.co https://apifreellm.com https://sbktqevuyofayyvcctyr.supabase.co https://*.vercel.app`,
    // Prevent clickjacking
    `frame-ancestors 'none'`,
    // Block mixed content in production
    ...(process.env.NODE_ENV === "production" ? [`upgrade-insecure-requests`] : []),
    // Base URI restriction
    `base-uri 'self'`,
    // Form submission restriction
    `form-action 'self'`,
    // CSP report endpoint for violation monitoring
    `report-uri /api/security/csp-report`,
  ];

  return directives.join("; ");
}

/**
 * Next.js 16 proxy — runs on every qualifying request before the route handler.
 *
 * This replaces the deprecated middleware.ts convention.
 *
 * Responsibilities:
 * 1. Generate a unique CSP nonce per request (for SSR layouts via x-csp-nonce header)
 * 2. Apply comprehensive security headers to the response
 * 3. Run Supabase session refresh and route guard
 */
export default async function proxy(request: NextRequest) {
  // ── 1. Generate CSP nonce ──────────────────────────────────────
  const nonce = crypto.randomUUID();

  // ── 2. Clone request with nonce so layouts/routes can read it ──
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-csp-nonce", nonce);

  const requestWithNonce = new NextRequest(request, {
    headers: requestHeaders,
  });

  // ── 3. Run Supabase auth session management ────────────────────
  // Returns a response (potentially a redirect for unauthenticated routes)
  const response = await updateSession(requestWithNonce);

  // ── 4. Apply security headers ──────────────────────────────────
  response.headers.set("Content-Security-Policy", buildCsp());
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload"
  );
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set(
    "Referrer-Policy",
    "strict-origin-when-cross-origin"
  );
  response.headers.set(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), payment=(), usb=()"
  );
  response.headers.set("X-XSS-Protection", "1; mode=block");

  return response;
}

/**
 * Proxy matcher — only run on qualifying routes.
 * Skips static assets, images, and known public files.
 */
export const config = {
  matcher: [
    // Run on all routes EXCEPT static assets, images, and favicon
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot)$).*)",
  ],
};
