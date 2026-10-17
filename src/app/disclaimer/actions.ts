"use server";

import { cookies } from "next/headers";
import { DISCLAIMER_COOKIE, DISCLAIMER_MAX_AGE } from "@/shared/lib/disclaimer";

/**
 * Marca el aviso legal como aceptado durante 30 días.
 *
 * El proxy (`src/proxy.ts`) es quien aplica la barrera: aquí sólo se escribe
 * la cookie. `httpOnly` es seguro porque la cookie se lee en el servidor
 * (proxy y page), nunca desde el cliente.
 */
export async function acceptDisclaimer(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(DISCLAIMER_COOKIE, "true", {
    maxAge: DISCLAIMER_MAX_AGE,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}
