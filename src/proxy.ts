import { NextRequest } from 'next/server'
import { updateSession } from '@/shared/lib/supabase/middleware'

export default async function proxy(request: NextRequest) {
  // El helper updateSession ya maneja NextUrl, NextResponse, 
  // la regeneración del JWT de Supabase, y la protección de rutas.
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

