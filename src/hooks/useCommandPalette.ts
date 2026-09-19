'use client';

import { useCallback, useEffect, useState } from 'react';
import { OPEN_PALETTE_EVENT } from '@/features/dashboard/DashboardHeader';

/* ─── useCommandPalette ───────────────────────────────────────────────────
   Estado de apertura de la paleta de comandos. La única vía de apertura es
   el contrato `scaudit:open-palette` (trigger del header + atajo global
   Ctrl/⌘K registrado en DashboardHeader). El cierre lo gestiona el Dialog.
   Semana 4 rediseño. */

export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  return { open, setOpen, close };
}
