import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/shared/config/env";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    env.supabaseUrl,
    env.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // ── Dev bypass: saltea auth si NEXT_PUBLIC_DEV_BYPASS_AUTH=true ──
  // Esto permite testear el dashboard sin autenticarse en desarrollo.
  const DEV_BYPASS = process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true';

  if (DEV_BYPASS) {
    return supabaseResponse;
  }

  // NOTA: Es mandatorio llamar a getUser() para que la sesión se refresque si está a punto de expirar.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const url = request.nextUrl.clone();
  const currentPath = request.nextUrl.pathname;

  // ─── Gate /admin: solo el email admin de plataforma ───────────────────
  // Cualquier otro usuario autenticado (o anónimo) vuelve a "/".
  // La page de /admin re-valida con requireAdmin() + email (defense-in-depth).
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "palacios_juan@hotmail.com";
  if (currentPath.startsWith("/admin")) {
    if (!user || user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  // ─── Telemetría de accesos (no bloqueante, throttled) ─────────────────
  // 1 cada 5 min por navegador: la cookie sl_track evita duplicar escrituras
  // en cada request. El endpoint interno resuelve sesión y hace upsert en DB.
  if (user) {
    const lastTrack = Number(request.cookies.get("sl_track")?.value ?? 0);
    if (Date.now() - lastTrack > 5 * 60 * 1000) {
      const trackUrl = new URL("/api/internal/track-access", request.url);
      fetch(trackUrl, {
        method: "POST",
        headers: {
          // Mismo origen: las cookies de sesión viajan solas; los headers de
          // IP/país se replican porque el fetch interno no los hereda.
          cookie: request.headers.get("cookie") ?? "",
          "x-forwarded-for": request.headers.get("x-forwarded-for") ?? "",
          "x-real-ip": request.headers.get("x-real-ip") ?? "",
          "x-vercel-ip-country": request.headers.get("x-vercel-ip-country") ?? "",
          "user-agent": request.headers.get("user-agent") ?? "",
        },
      }).catch(() => {
        /* telemetría no bloqueante */
      });
      supabaseResponse.cookies.set("sl_track", String(Date.now()), {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 300,
        secure: process.env.NODE_ENV === "production",
        path: "/",
      });
    }
  }

  // 1. Proteger rutas privadas (ej. /projects, /dashboard, etc.)
  // Agrega aquí las rutas que deseas proteger. Si el panel entero está protegido, 
  // puedes invertir la lógica y verificar rutas públicas.
  // SECURITY (VULN-003): /intelligence is a sensitive UI shell that must
  // require an active session (defense-in-depth — the data APIs already auth).
  const isProtectedRoute = currentPath.startsWith('/projects') || currentPath.startsWith('/dashboard') || currentPath.startsWith('/settings') || currentPath.startsWith('/intelligence');
  
  if (isProtectedRoute && !user) {
    url.pathname = '/login'; // O la ruta de autenticación que uses
    return NextResponse.redirect(url);
  }

  // 2. Redirigir a usuarios ya logueados lejos del login/registro
  const isAuthRoute = currentPath.startsWith('/login') || currentPath.startsWith('/register');
  if (isAuthRoute && user) {
    url.pathname = '/'; // O donde redirijas a los usuarios tras login
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
