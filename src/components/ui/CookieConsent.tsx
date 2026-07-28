"use client";

import React, { useState, useEffect } from "react";
import { Settings, Check, Cookie } from "lucide-react";

interface CookiePreferences {
  essential: boolean;
  analytical: boolean;
  marketing: boolean;
}

export function CookieConsent() {
  const [mounted, setMounted] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>({
    essential: true,
    analytical: false,
    marketing: false,
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const consent = localStorage.getItem("strategic-cookie-consent");
    if (!consent) {
      setShowBanner(true);
    } else {
      try {
        const parsed = JSON.parse(consent);
        setPreferences(parsed);
      } catch {
        setShowBanner(true);
      }
    }
  }, []);

  const handleAcceptAll = () => {
    const allPreferences = {
      essential: true,
      analytical: true,
      marketing: true,
    };
    localStorage.setItem("strategic-cookie-consent", JSON.stringify(allPreferences));
    setPreferences(allPreferences);
    setShowBanner(false);
    // Dynamic event trigger for Google Analytics, GTM, etc.
    triggerAnalytics(allPreferences);
  };

  const handleDeclineAll = () => {
    const essentialOnly = {
      essential: true,
      analytical: false,
      marketing: false,
    };
    localStorage.setItem("strategic-cookie-consent", JSON.stringify(essentialOnly));
    setPreferences(essentialOnly);
    setShowBanner(false);
    triggerAnalytics(essentialOnly);
  };

  const handleSavePreferences = () => {
    localStorage.setItem("strategic-cookie-consent", JSON.stringify(preferences));
    setShowBanner(false);
    triggerAnalytics(preferences);
  };

  const triggerAnalytics = (prefs: CookiePreferences) => {
    if (prefs.analytical) {
      // Trigger analytics scripts
      window.dispatchEvent(new CustomEvent("cookie-consent-analytical-enabled"));
    }
    if (prefs.marketing) {
      // Trigger marketing scripts
      window.dispatchEvent(new CustomEvent("cookie-consent-marketing-enabled"));
    }
  };

  if (!mounted || !showBanner) return null;

  return (
    <div className="fixed bottom-6 left-6 right-6 z-50 max-w-4xl mx-auto md:right-auto md:left-6 md:max-w-md lg:max-w-xl animate-fade-in-up">
      <div className="bg-[#0b0c0e]/95 backdrop-blur-xl border border-gold/20 rounded-2xl p-5 md:p-6 shadow-2xl shadow-black/80 flex flex-col gap-4 relative overflow-hidden">
        {/* Glow decoration */}
        <div className="absolute -top-10 -right-10 w-24 h-24 bg-gold/10 rounded-full blur-xl pointer-events-none" />
        
        <div className="flex items-start gap-3.5">
          <div className="p-2 bg-gold/10 border border-gold/30 rounded-xl text-gold-light mt-0.5">
            <Cookie className="w-5 h-5 animate-pulse" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-bold text-white font-montserrat tracking-wide flex items-center gap-1.5">
              Control de Privacidad de Cookies
            </h4>
            <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
              En <span className="text-white font-medium">StrategicConnex</span> utilizamos cookies propias y de terceros para optimizar tu experiencia técnica, analizar el tráfico web y ofrecer anuncios adaptados. Cumplimos estrictamente con la Ley de Protección de Datos Personales de Argentina (Nº 25.326) y el GDPR europeo.
            </p>
          </div>
        </div>

        {showPreferences && (
          <div className="bg-black/40 border border-white/5 rounded-xl p-3.5 flex flex-col gap-3 animate-slide-down">
            <h5 className="text-[11px] font-bold text-gold uppercase tracking-wider">Configurar preferencias</h5>
            
            {/* Essential Cookies */}
            <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-2">
              <div>
                <span className="block text-xs font-semibold text-white">Esenciales y Técnicas</span>
                <span className="text-[10px] text-gray-500">Obligatorias para el funcionamiento básico, seguridad y estado de consentimientos del sitio.</span>
              </div>
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  disabled
                  checked
                  className="w-4 h-4 rounded border-gold bg-gold/20 text-gold focus:ring-0 opacity-60 cursor-not-allowed"
                />
              </div>
            </div>

            {/* Analytical Cookies */}
            <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-2">
              <div>
                <span className="block text-xs font-semibold text-white">Estadísticas y Analíticas</span>
                <span className="text-[10px] text-gray-500">Permiten medir la cantidad de visitas, páginas más vistas y optimizar el rendimiento técnico de navegación.</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={preferences.analytical}
                  onChange={(e) => setPreferences({ ...preferences, analytical: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-white/10 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-gray-300 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-gold peer-checked:after:bg-black" />
              </label>
            </div>

            {/* Marketing Cookies */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <span className="block text-xs font-semibold text-white">Marketing y Personalización</span>
                <span className="text-[10px] text-gray-500">Utilizadas para crear perfiles de interés técnico, personalizar campañas publicitarias en LinkedIn o Google.</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={preferences.marketing}
                  onChange={(e) => setPreferences({ ...preferences, marketing: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-white/10 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-gray-300 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-gold peer-checked:after:bg-black" />
              </label>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 mt-2 sm:mt-1 font-montserrat">
          <button
            onClick={showPreferences ? handleSavePreferences : () => setShowPreferences(true)}
            className="flex-1 px-4 py-2 text-xs font-bold text-gray-300 border border-white/10 hover:border-gold/30 rounded-lg hover:text-white transition-all duration-300 flex items-center justify-center gap-1.5 order-2 sm:order-1"
          >
            <Settings className="w-3.5 h-3.5" />
            {showPreferences ? "Guardar selección" : "Configurar cookies"}
          </button>
          
          <div className="flex flex-1 gap-2 order-1 sm:order-2">
            {!showPreferences && (
              <button
                onClick={handleDeclineAll}
                className="flex-1 px-3 py-2 text-xs font-semibold text-gray-400 hover:text-white border border-transparent hover:bg-white/5 rounded-lg transition-all"
              >
                Rechazar
              </button>
            )}
            <button
              onClick={handleAcceptAll}
              className="flex-1 px-4 py-2 text-xs font-black text-black bg-gold hover:bg-gold-light rounded-lg shadow-lg shadow-gold/10 hover:shadow-gold/20 hover:scale-[1.01] transition-all duration-300 flex items-center justify-center gap-1"
            >
              <Check className="w-3.5 h-3.5 stroke-[3px]" />
              Aceptar todas
            </button>
          </div>
        </div>
        
        <div className="text-[10px] text-gray-600 text-center sm:text-left mt-1 border-t border-white/5 pt-2 flex items-center justify-between">
          <span>Ley 25.326 & GDPR Compliant</span>
          <a href="/privacy" className="hover:text-gold transition-colors font-medium underline">Leer Política de Privacidad</a>
        </div>
      </div>
    </div>
  );
}
