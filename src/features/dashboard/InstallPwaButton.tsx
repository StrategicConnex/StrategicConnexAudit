"use client";

import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { logger } from "@/lib/logger";

/**
 * InstallPwaButton — Botón de instalación PWA nativa.
 *
 * Escucha el evento 'beforeinstallprompt' y muestra un botón cuando
 * la PWA es instalable. Si ya está instalada (display-mode: standalone),
 * no muestra nada.
 *
 * Compatible con Chrome, Edge, Samsung Internet, Opera.
 * Safari no soporta beforeinstallprompt pero los usuarios pueden
 * instalar desde el menú Compartir → Agregar a pantalla de inicio.
 */
interface BeforeInstallPromptEventLike extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPwaButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEventLike | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Verificar si ya está instalada
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEventLike);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Detectar instalación exitosa
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    logger.info('[PWA] Install result:', result.outcome);

    if (result.outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  if (isInstalled || !deferredPrompt || dismissed) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleInstall}
        title="Instalar SCAUDIT como aplicación"
        className="relative flex items-center gap-1.5 text-2xs font-extrabold uppercase tracking-widest px-2.5 py-1.5 rounded-lg border transition-[color,background-color,border-color,transform] duration-300 hover:scale-[1.03] text-chartreuse bg-chartreuse/10 border-chartreuse/20 hover:bg-chartreuse/20"
      >
        <Download className="w-3 h-3" />
        <span className="hidden sm:inline">Instalar</span>
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="text-muted-fg/50 hover:text-muted-fg transition-colors p-1"
        title="Descartar"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
