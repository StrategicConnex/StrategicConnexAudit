/**
 * Intelligence Template — radar-grid backdrop for the intelligence cockpit.
 *
 * Route enter/exit animations are handled globally by the View Transitions
 * API (see src/app/template.tsx + globals.css `::view-transition-*` rules).
 * This template adds the radar-grid overlay that gives the /intelligence/*
 * section its distinct live-monitoring-station identity.
 *
 * `.vt-fallback-enter` provides the CSS enter animation only in browsers
 * without View Transitions API support.
 */
export default function IntelligenceTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full relative">
      {/* Radar-grid overlay — reuses existing utility from globals.css */}
      <div className="fixed inset-0 pointer-events-none radar-grid opacity-30" />

      {/* Content sits above the grid overlay. The root template already
          applies vt-fallback-enter for all routes, so no fallback class here
          to avoid double-animation in non-VT browsers. */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
