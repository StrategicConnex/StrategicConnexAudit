import { redirect } from "next/navigation";

/**
 * /dashboard — el dashboard vive en la raíz (`/`).
 *
 * Existían `/dashboard/realtime` y `/dashboard/usage` pero no esta ruta, así
 * que entrar a `/dashboard` devolvía un 404 en lugar de llevar al panel. Se
 * redirige en vez de duplicar el loader: la raiz ya es la vista de proyectos.
 *
 * TODO(Tanda 3 · B2): cuando exista la vista de portafolio agregada, esta ruta
 * pasará a renderizarla en lugar de redirigir.
 */
export default function DashboardRedirect() {
  redirect("/");
}
