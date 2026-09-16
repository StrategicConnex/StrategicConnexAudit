'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { PageShell } from '@/components/ui/PageShell';

const ApiKeysDashboard = dynamic(() => import('./ApiKeysDashboard'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="text-sm text-muted-fg">Cargando el panel de API Keys…</p>
      </div>
    </div>
  ),
});

export default function SettingsApiKeysPage() {
  return (
    <PageShell backLabel="Volver al panel">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-gradient-to-b from-primary/5 to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="relative z-10">
        <ApiKeysDashboard />
      </div>
    </PageShell>
  );
}
