import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

/**
 * `/dashboard` primero fue un 404 (la carpeta solo tenía `realtime/` y
 * `usage/`) y luego un redirect a `/`. Desde la tanda 3 · B2 existe el
 * roll-up cross-proyecto, así que la ruta abre directamente la vista de
 * portafolio: es el enlace que un director pega en un ticket.
 *
 * Estos tests fijan ese comportamiento — que no vuelva a ser un redirect
 * silencioso ni un 404. Con H-10b F-C el chrome (sidebar/header/hero) vive en
 * `DashboardShell` y la pestaña inicial la fija ÉL (`defaultTab="portfolio"`),
 * mientras los paneles con datos quedan dentro de su frontera de Suspense.
 */

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/shared/lib/supabase/server", () => ({
  createClient: () => Promise.resolve({ auth: { getUser: mocks.getUser } }),
}));

/**
 * `redirect()` de Next no devuelve: lanza NEXT_REDIRECT. El mock replica ese
 * contrato porque en esta ruta el redirect va en medio del flujo; un mock que
 * solo registra la llamada dejaría el código seguir hacia `user.id`, que es
 * null sin sesión, y el test probaría un TypeError en vez del redirect.
 */
class RedirectSignal extends Error {}

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => {
    mocks.redirect(...args);
    throw new RedirectSignal("NEXT_REDIRECT");
  },
}));

/** El shell es un client component: aquí se sustituye por un nodo que deja
 *  ver su `defaultTab` (la pestaña inicial) y renderiza a sus hijos. */
vi.mock("@/features/dashboard/DashboardShell", () => ({
  DashboardShell: (props: { defaultTab?: string; children?: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "shell", "data-tab": props.defaultTab }, props.children),
}));

vi.mock("@/features/dashboard/DashboardContainer", () => ({
  DashboardContainer: () => React.createElement("div", { "data-testid": "container" }),
}));

/**
 * `withRLS` entrega la transacción real en producción; aquí se sustituye por
 * un doble encadenable. El loader de la ruta hace `.select().from().where()…`,
 * así que cada eslabón devuelve el mismo doble terminal y el resultado es un
 * array vacío — la ruta debe poder renderizar sin proyectos.
 */
function fakeTx(): unknown {
  // Cada eslabón devuelve el mismo terminal, así cualquier cadena
  // `.select().from().where()…` resuelve a la lista vacía final.
  const terminal: Record<string, unknown> = {
    then: (resolve: (v: unknown[]) => unknown) => Promise.resolve([]).then(resolve),
  };
  for (const method of ["select", "from", "where", "orderBy", "groupBy", "limit"]) {
    terminal[method] = () => terminal;
  }
  return terminal;
}

vi.mock("@/shared/db/rls", () => ({
  withRLS: (_userId: string, cb: (tx: unknown) => Promise<unknown>) => cb(fakeTx()),
}));

/**
 * Estructura post F-C: Page() → elemento del shell (mockeado) cuyo hijo es el
 * componente async de la ruta (antes estaba envuelto en un `<Suspense>`; hoy
 * esa frontera vive dentro del shell). Se invoca el hijo, se resuelve y se
 * renderiza el shell ya con el contenido resuelto.
 */
async function renderRoute(): Promise<string> {
  const { default: Page } = await import("./page");
  const shell = (Page as unknown as () => React.ReactElement)();
  const content = shell.props.children as React.ReactElement;
  const Inner = content.type as () => Promise<React.ReactElement>;
  const resolved = await Inner();
  const { renderToStaticMarkup } = await import("react-dom/server");
  return renderToStaticMarkup(React.cloneElement(shell, {}, resolved));
}

describe("/dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "a@b.test" } } });
  });

  it("renderiza la vista de portafolio en vez de redirigir", async () => {
    const html = await renderRoute();
    expect(html).toContain('data-testid="container"');
    // La pestaña inicial la fija el shell (chrome fuera del Suspense).
    expect(html).toContain('data-testid="shell"');
    expect(html).toContain('data-tab="portfolio"');
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("sin sesión va a /login en vez de renderizar el portafolio", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    // El redirect corta el flujo lanzando; eso es lo que se comprueba aquí.
    await expect(renderRoute()).rejects.toBeInstanceOf(RedirectSignal);
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  it("declara render dinámico (el score no puede cachearse)", async () => {
    const mod = await import("./page");
    expect(mod.dynamic).toBe("force-dynamic");
  });
});
