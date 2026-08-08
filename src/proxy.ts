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
 * Generates a Content-Security-Policy header string with a per-request nonce.
 *
 * The nonce is generated per-request, set on the REQUEST headers (Next.js 16
 * parses the CSP header from the request during dynamic rendering and applies
 * the nonce to its own inline scripts/styles automatically), and echoed on the
 * RESPONSE header so the browser enforces it.
 *
 * NOTE: 'unsafe-inline' must NOT appear in script-src: its presence silently
 * disables nonce enforcement in every CSP3 browser, turning the nonce into a
 * no-op. 'strict-dynamic' lets the nonce'd Next.js runtime load its
 * dynamically-created chunk scripts (host-source allowlists are ignored for
 * dynamically created scripts when strict-dynamic is present).
 */
function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  const directives = [
    `default-src 'self'`,
    // Scripts: self (Next.js bundles) + per-request nonce (inline hydration
    // scripts are nonce'd automatically by Next.js 16) + strict-dynamic
    // (chunk scripts created by the nonce'd runtime inherit trust).
    // 'unsafe-eval' is required by React dev tooling in development only.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // Styles: Next.js injects inline styles and components use inline style
    // attributes. Inline styles cannot execute script, so 'unsafe-inline'
    // here does not open an XSS bypass.
    `style-src 'self' 'unsafe-inline'`,
    // Objects (flash/java plugins) — not used anywhere in the app
    `object-src 'none'`,
    // Images: allow data: URIs (inline images) and HTTPS (external images)
    `img-src 'self' data: https:`,
    // Fonts: allow data: URIs (icon fonts) and self-hosted
    `font-src 'self' data:`,
    // Connections: Supabase (auth/DB/realtime) is the only cross-origin
    // destination the browser needs. LLM providers and SIEM exporters are
    // called server-side and are not governed by this policy, so their
    // domains (apifreellm.com, *.vercel.app, …) must NOT be allowlisted here
    // — they would only widen the data-exfiltration surface.
    `connect-src 'self' https://*.supabase.co`,
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
  // ── 1. Generate CSP nonce (unique per request) ──────────────────
  const nonce = crypto.randomUUID();
  const csp = buildCsp(nonce);

  // ── 2. Clone request with nonce + CSP so Next.js can extract the ──
  // nonce and apply it to its inline scripts during rendering, and so
  // layouts can read it via next/headers.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-csp-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const requestWithNonce = new NextRequest(request, {
    headers: requestHeaders,
  });

  // ── 3. Run Supabase auth session management ────────────────────
  // Returns a response (potentially a redirect for unauthenticated routes)
  const response = await updateSession(requestWithNonce);

  // ── 4. Apply security headers (CSP echoed with the same nonce) ──
  response.headers.set("Content-Security-Policy", csp);
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
