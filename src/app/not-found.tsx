import Link from "next/link";
import { Home, Shield, Search } from "lucide-react";

export default function NotFoundPage() {
  return (
    <div className="min-h-dvh w-full flex items-center justify-center bg-background relative overflow-hidden">
      {/* Background orbs */}
      <div className="absolute top-[-15%] left-[-15%] w-[50%] h-[50%] bg-amber-500/8 blur-[150px] rounded-full animate-pulse"
        style={{ animationDuration: "8s" }} />
      <div className="absolute bottom-[-15%] right-[-15%] w-[50%] h-[50%] bg-indigo-600/6 blur-[120px] rounded-full animate-pulse hidden sm:block"
        style={{ animationDuration: "12s", animationDelay: "-1.5s" }} />

      {/* Scan-line overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.015]"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(255,255,255,0.03) 1px, rgba(255,255,255,0.03) 2px)",
          backgroundSize: "100% 2px",
        }}
      />

      <div className="z-10 w-full max-w-md px-4 sm:px-6 animate-fade-in">
        <div className="glass-card p-6 sm:p-8 relative text-center">
          {/* Top glow line */}
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />

          {/* 404 large */}
          <h1 className="font-display text-6xl sm:text-7xl md:text-8xl font-black text-foreground tracking-tight mb-2 leading-none"
            style={{ textShadow: "0 0 80px oklch(0.78 0.18 140/0.08)" }}>
            404
          </h1>

          {/* Subtle scanline under 404 */}
          <div className="w-16 h-[2px] bg-gradient-to-r from-transparent via-amber-500/40 to-transparent mx-auto my-4" />

          {/* Title */}
          <h2 className="font-display text-lg sm:text-xl font-bold text-foreground tracking-tight mb-3">
            Página No Encontrada
          </h2>

          {/* Description */}
          <p className="text-sm sm:text-base text-muted-fg mb-2 leading-relaxed">
            La ruta que buscas no existe o ha sido movida.
          </p>
          <p className="text-xs sm:text-sm text-muted-fg/70 mb-6 sm:mb-8 leading-relaxed flex items-center justify-center gap-1.5">
            <Search className="w-3 h-3" />
            Verifica la URL e intenta de nuevo.
          </p>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/login"
              className="group relative inline-flex items-center justify-center gap-2 py-3 sm:py-3.5 px-6 rounded-xl bg-primary text-primary-fg font-semibold focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background transition-all duration-300 active:scale-[0.97] overflow-hidden hover:bg-primary/90 shadow-lg shadow-primary/20"
            >
              <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              <span className="relative z-10 flex items-center gap-2">
                <Home className="w-4 h-4" />
                <span className="text-sm sm:text-base">Ir al Inicio</span>
              </span>
            </Link>
          </div>

          {/* Footer */}
          <div className="mt-7 sm:mt-8 pt-5 sm:pt-6 border-t border-border">
            <div className="flex items-center justify-center gap-2 text-[10px] sm:text-xs text-muted-fg/60">
              <Shield className="w-3 h-3" />
              <span>StrategicAudit Pro · Route Intelligence</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
