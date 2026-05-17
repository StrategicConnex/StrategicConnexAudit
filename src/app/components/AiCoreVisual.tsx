'use client';

interface AiCoreVisualProps {
  size?: number;
  interactive?: boolean;
}

export default function AiCoreVisual({ size = 200, interactive = true }: AiCoreVisualProps) {
  return (
    <div 
      style={{ width: size, height: size }}
      className={`relative flex items-center justify-center select-none transition-all duration-500 ease-out ${
        interactive ? 'hover:scale-[1.06] hover:rotate-[2deg] active:scale-[0.98]' : ''
      }`}
    >
      {/* Premium ambient backdrop glow when interactive */}
      {interactive && (
        <div className="absolute inset-0 bg-red-500/10 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      )}
      
      <img
        src="/logo_reina.png"
        alt="StrategicAudit Pro Logo"
        className="w-full h-full object-contain"
        draggable={false}
      />
    </div>
  );
}
