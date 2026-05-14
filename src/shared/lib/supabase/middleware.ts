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

  // NOTA: Es mandatorio llamar a getUser() para que la sesión se refresque si está a punto de expirar.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const url = request.nextUrl.clone();
  const currentPath = request.nextUrl.pathname;

  // 1. Proteger rutas privadas (ej. /projects, /dashboard, etc.)
  // Agrega aquí las rutas que deseas proteger. Si el panel entero está protegido, 
  // puedes invertir la lógica y verificar rutas públicas.
  const isProtectedRoute = currentPath.startsWith('/projects') || currentPath.startsWith('/dashboard') || currentPath.startsWith('/settings');
  
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
