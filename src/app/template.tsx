/**
 * Root Template — route enter/exit animations.
 *
 * Next.js re-mounts <Template> on every navigation (unlike <Layout> which
 * persists). With `experimental.viewTransition` enabled in next.config.ts,
 * every client-side <Link> navigation is wrapped in
 * `document.startViewTransition`, and the ::view-transition-old/new(root)
 * CSS in globals.css animates the outgoing + incoming page.
 *
 * Browsers without View Transitions API support (Firefox < 144,
 * Safari < 18.2) get a plain CSS enter animation via the `.vt-fallback-enter`
 * class, guarded by `@supports not (view-transition-name: root)` so
 * VT-supporting browsers never double-animate.
 *
 * This stays a Server Component — no client-side JS needed.
 */
export default function RootTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="vt-fallback-enter">{children}</div>;
}
