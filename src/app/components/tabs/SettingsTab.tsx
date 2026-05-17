import React from 'react';
import { Settings, Palette, Save } from 'lucide-react';

export function SettingsTab() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl">
      <div className="glass-card rounded-apple-md p-10 relative overflow-hidden shadow-sm">
        <div className="absolute top-0 right-0 w-64 h-64 bg-apple-blue/5 rounded-apple-pill blur-3xl" />
        
        <div className="mb-12 relative z-10">
          <h2 className="text-2xl font-bold tracking-tight text-apple-ink flex items-center gap-3">
            <Settings className="w-6 h-6 text-apple-blue" />
            Configuracion del Sistema
          </h2>
          <p className="text-[15px] text-apple-ink/40 mt-2">Administra las credenciales, llaves de API y preferencias de la agencia.</p>
        </div>

        <div className="space-y-12 relative z-10">
          <div className="space-y-6">
            <h3 className="text-[11px] font-bold text-apple-ink/40 uppercase tracking-widest border-b border-apple-gray-dark/5 pb-3">Integraciones de IA</h3>
            <div className="bg-apple-gray/50 border border-apple-gray-dark/10 rounded-apple-md p-8 group hover:bg-apple-white/80 hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[15px] font-bold text-apple-ink tracking-tight">OpenRouter / LLM API Key</span>
                <span className="text-[10px] font-bold bg-green-500/10 text-green-600 px-3 py-1 rounded-apple-pill border border-green-500/20 uppercase tracking-widest">Activo</span>
              </div>
              <p className="text-[13px] text-apple-ink/60 mb-6 leading-relaxed">La configuracion de los modelos se maneja automaticamente via variables de entorno.</p>
              <input type="password" value="************************" readOnly className="w-full bg-apple-white border border-apple-gray-dark/10 rounded-apple-pill px-6 py-3 text-[13px] text-apple-ink/40 focus:outline-none font-mono" />
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-[11px] font-bold text-apple-ink/40 uppercase tracking-widest border-b border-apple-gray-dark/5 pb-3 flex items-center gap-2">
              <Palette className="w-4 h-4 text-apple-blue" /> Marca Blanca (White Label)
            </h3>
            <div className="bg-apple-gray/50 border border-apple-gray-dark/10 rounded-apple-md p-8 group hover:bg-apple-white/80 hover:shadow-md transition-all">
              <p className="text-[13px] text-apple-ink/60 mb-10 leading-relaxed">Personaliza los logos y colores para los reportes ejecutivos exportados.</p>
              
              <div className="grid gap-8">
                <div className="space-y-3">
                  <label className="text-[11px] font-bold text-apple-ink/40 uppercase tracking-widest">Nombre de la Agencia</label>
                  <input 
                    type="text" 
                    placeholder="Ej: Strategic SEO Agency" 
                    className="w-full bg-apple-white border border-apple-gray-dark/10 rounded-apple-pill px-6 py-3 text-[15px] text-apple-ink font-medium focus:outline-none focus:border-apple-blue transition-all"
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
                    <label className="text-[11px] font-bold text-apple-ink/40 uppercase tracking-widest">Color Principal</label>
                    <div className="flex gap-4 items-center">
                      <input 
                        type="color" 
                        className="w-12 h-12 rounded-apple-pill border-none bg-transparent p-0 cursor-pointer"
                        id="branding-color-picker"
                        defaultValue={typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('agencyBranding') || '{}').color || '#0071e3' : '#0071e3'}
                        onChange={(e) => {
                          const current = JSON.parse(localStorage.getItem('agencyBranding') || '{}');
                          localStorage.setItem('agencyBranding', JSON.stringify({ ...current, color: e.target.value }));
                        }}
                      />
                      <input 
                        type="text" 
                        id="branding-color-text"
                        placeholder="#0071e3" 
                        className="flex-1 bg-apple-white border border-apple-gray-dark/10 rounded-apple-pill px-6 py-3 text-[13px] font-bold text-apple-ink focus:outline-none focus:border-apple-blue transition-all uppercase"
                        defaultValue={typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('agencyBranding') || '{}').color || '#0071e3' : '#0071e3'}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <label className="text-[11px] font-bold text-apple-ink/40 uppercase tracking-widest">Logo URL</label>
                    <input 
                      type="text" 
                      placeholder="https://tudominio.com/logo.png" 
                      className="w-full bg-apple-white border border-apple-gray-dark/10 rounded-apple-pill px-6 py-3 text-[13px] text-apple-ink font-medium focus:outline-none focus:border-apple-blue transition-all"
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
                  className="bg-apple-ink text-black px-10 py-4 rounded-apple-pill text-[11px] font-bold uppercase tracking-widest shadow-xl shadow-apple-ink/10 hover:bg-apple-blue hover:text-white transition-all flex items-center gap-3 group"
                >
                  <Save className="w-4 h-4 group-hover:scale-110 transition-transform" /> Guardar Preferencias
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
