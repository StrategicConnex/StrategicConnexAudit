import React from 'react';
import { Settings, Palette, Save } from 'lucide-react';

export function SettingsTab() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl font-sans text-zinc-100 relative z-10">
      <div className="backdrop-blur-xl border border-white/[0.06] bg-white/[0.01] rounded-2xl p-10 relative overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
        <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="mb-12 relative z-10">
          <h2 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <Settings className="w-6 h-6 text-cyan-400" />
            Configuración del Sistema
          </h2>
          <p className="text-sm text-zinc-500 mt-2">Administre las credenciales de API, llaves de análisis y preferencias de personalización de su marca.</p>
        </div>

        <div className="space-y-12 relative z-10">
          {/* IA integrations */}
          <div className="space-y-6">
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-b border-white/[0.06] pb-3">Integraciones de Inteligencia Artificial</h3>
            <div className="bg-white/[0.005] border border-white/[0.06] rounded-2xl p-8 hover:bg-white/[0.01] transition-all">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[15px] font-bold text-white tracking-tight">OpenRouter / LLM API Gateway</span>
                <span className="text-[9px] font-bold bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/20 uppercase tracking-wider">Activo</span>
              </div>
              <p className="text-xs text-zinc-500 mb-6 leading-relaxed">El aprovisionamiento de modelos generativos se gestiona de forma segura a través de variables de entorno del servidor.</p>
              <input 
                type="password" 
                value="************************************************" 
                readOnly 
                className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-6 py-3.5 text-xs text-zinc-500 focus:outline-none font-mono tracking-wider" 
              />
            </div>
          </div>

          {/* White label settings */}
          <div className="space-y-6">
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest border-b border-white/[0.06] pb-3 flex items-center gap-2">
              <Palette className="w-4 h-4 text-cyan-400" /> Marca Blanca (White Label)
            </h3>
            <div className="bg-white/[0.005] border border-white/[0.06] rounded-2xl p-8 hover:bg-white/[0.01] transition-all">
              <p className="text-xs text-zinc-500 mb-10 leading-relaxed">Personalice los informes y las plantillas ejecutivas PDF con la identidad y el logotipo de su agencia o cliente corporativo.</p>
              
              <div className="grid gap-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Nombre de la Agencia</label>
                  <input 
                    type="text" 
                    placeholder="Ej: Strategic SEO Agency" 
                    className="w-full bg-black/60 border border-white/[0.08] focus:border-cyan-500 rounded-xl px-6 py-3.5 text-sm text-zinc-200 font-bold focus:outline-none transition-all placeholder-zinc-700 focus:shadow-[0_0_15px_rgba(6,182,212,0.1)]"
                    id="branding-name-input"
                    defaultValue={typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('agencyBranding') || '{}').name || '' : ''}
                    onChange={(e) => {
                      const current = JSON.parse(localStorage.getItem('agencyBranding') || '{}');
                      localStorage.setItem('agencyBranding', JSON.stringify({ ...current, name: e.target.value }));
                    }}
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Color Principal</label>
                    <div className="flex gap-4 items-center">
                      <input 
                        type="color" 
                        className="w-12 h-12 rounded-full border-2 border-white/[0.1] bg-transparent p-0 cursor-pointer overflow-hidden"
                        id="branding-color-picker"
                        defaultValue={typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('agencyBranding') || '{}').color || '#06b6d4' : '#06b6d4'}
                        onChange={(e) => {
                          const current = JSON.parse(localStorage.getItem('agencyBranding') || '{}');
                          localStorage.setItem('agencyBranding', JSON.stringify({ ...current, color: e.target.value }));
                          const txt = document.getElementById('branding-color-text') as HTMLInputElement;
                          if (txt) txt.value = e.target.value;
                        }}
                      />
                      <input 
                        type="text" 
                        id="branding-color-text"
                        placeholder="#06b6d4" 
                        className="flex-1 bg-black/60 border border-white/[0.08] focus:border-cyan-500 rounded-xl px-6 py-3.5 text-sm font-bold text-zinc-200 focus:outline-none transition-all uppercase placeholder-zinc-700"
                        defaultValue={typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('agencyBranding') || '{}').color || '#06b6d4' : '#06b6d4'}
                        onChange={(e) => {
                          const current = JSON.parse(localStorage.getItem('agencyBranding') || '{}');
                          localStorage.setItem('agencyBranding', JSON.stringify({ ...current, color: e.target.value }));
                          const picker = document.getElementById('branding-color-picker') as HTMLInputElement;
                          if (picker) picker.value = e.target.value;
                        }}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Logo URL (PNG/SVG)</label>
                    <input 
                      type="text" 
                      placeholder="https://tudominio.com/logo.png" 
                      className="w-full bg-black/60 border border-white/[0.08] focus:border-cyan-500 rounded-xl px-6 py-3.5 text-sm text-zinc-200 font-bold focus:outline-none transition-all placeholder-zinc-700 focus:shadow-[0_0_15px_rgba(6,182,212,0.1)]"
                      defaultValue={typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('agencyBranding') || '{}').logoUrl || '' : ''}
                      onChange={(e) => {
                        const current = JSON.parse(localStorage.getItem('agencyBranding') || '{}');
                        localStorage.setItem('agencyBranding', JSON.stringify({ ...current, logoUrl: e.target.value }));
                      }}
                    />
                  </div>
                </div>
              </div>
              
              <div className="mt-12 flex justify-end">
                <button 
                  onClick={() => alert("¡Configuración guardada correctamente en el almacenamiento local!")}
                  className="bg-cyan-500 hover:bg-cyan-400 text-black px-10 py-3.5 rounded-xl text-[11px] font-extrabold uppercase tracking-widest shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_25px_rgba(6,182,212,0.45)] transition-all flex items-center gap-3 group cursor-pointer"
                >
                  <Save className="w-4 h-4 group-hover:scale-110 transition-transform text-black" /> Guardar Preferencias
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
