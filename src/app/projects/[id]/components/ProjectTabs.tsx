'use client';

import { useState, type ReactNode } from 'react';
import { Tabs, TabsList, TabsTab, TabsPanel } from '@/components/ui/Tabs';

/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT ProjectTabs — Resumen | Auditorías | Configuración (spec §5.2).
   Sin pestaña de Inteligencia a propósito: vive en el dashboard y
   duplicarla aquí sería scope creep. Las secciones llegan como slots
   desde el Server Component. Semana 6 rediseño.
   ═══════════════════════════════════════════════════════════════════════ */

export function ProjectTabs({
  overview,
  audits,
  config,
}: {
  overview: ReactNode;
  audits: ReactNode;
  config: ReactNode;
}) {
  const [value, setValue] = useState('overview');
  return (
    <Tabs value={value} onValueChange={(v) => setValue(v as string)}>
      <TabsList aria-label="Secciones del proyecto">
        <TabsTab value="overview">Resumen</TabsTab>
        <TabsTab value="audits">Auditorías</TabsTab>
        <TabsTab value="config">Configuración</TabsTab>
      </TabsList>
      <TabsPanel value="overview">{overview}</TabsPanel>
      <TabsPanel value="audits">{audits}</TabsPanel>
      <TabsPanel value="config">{config}</TabsPanel>
    </Tabs>
  );
}
