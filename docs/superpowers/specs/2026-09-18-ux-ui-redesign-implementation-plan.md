# SCAUDIT Pro — Plan de Implementación: Rediseño UX/UI

**Fecha**: 2026-09-18
**Spec base**: `2026-09-18-ux-ui-redesign-design.md`
**Enfoque**: Incremental con Headless UI
**Timeline**: 12 semanas

---

## Resumen

Plan de implementación para el rediseño completo de UX/UI de SCAUDIT Pro. Cada semana produce un PR mergeable con cambios visibles.

---

## Fase 1: Design System Base (Semanas 1-2)

### Semana 1: Tokens y Variables CSS

**Objetivo**: Establecer la base visual del design system.

**Tareas**:
1. Instalar `@headlessui/react`
2. Crear `src/styles/design-tokens.css` con variables CSS:
   - Colores (primary, accent, success, warning, danger, surfaces)
   - Tipografía (font families, sizes, weights)
   - Espaciado (spacing scale 4-64px)
   - Border radius (sm, md, lg, xl)
   - Shadows (card, elevated, focused)
3. Actualizar `tailwind.config.ts` para usar los tokens
4. Crear `src/components/ui/` con componentes base:
   - `Button.tsx` (primary, secondary, ghost, danger variants)
   - `Badge.tsx` (severity: critical, warning, info, success)
   - `Card.tsx` (elevated, flat, interactive variants)
5. Actualizar `globals.css` con los tokens

**Archivos a crear/modificar**:
- `src/styles/design-tokens.css` (nuevo)
- `tailwind.config.ts` (modificar)
- `src/app/globals.css` (modificar)
- `src/components/ui/Button.tsx` (nuevo)
- `src/components/ui/Badge.tsx` (nuevo)
- `src/components/ui/Card.tsx` (nuevo)

**Criterio de aceptación**:
- Todos los tokens CSS están definidos
- Tailwind los reconoce
- Componentes base renderizan correctamente
- Storybook (si existe) muestra los componentes

---

### Semana 2: Componentes Base Headless UI

**Objetivo**: Migrar componentes shadcn a Headless UI.

**Tareas**:
1. Migrar `Dialog` → Headless UI `Dialog`
2. Migrar `DropdownMenu` → Headless UI `Menu`
3. Migrar `Select` → Headless UI `Listbox`
4. Migrar `Switch` → Headless UI `Switch`
5. Migrar `Tabs` → Headless UI `Tabs`
6. Crear wrapper `Toast` con Headless UI `Transition`
7. Actualizar imports en archivos existentes

**Archivos a crear/modificar**:
- `src/components/ui/Dialog.tsx` (reemplazar)
- `src/components/ui/DropdownMenu.tsx` (reemplazar)
- `src/components/ui/Select.tsx` (reemplazar)
- `src/components/ui/Switch.tsx` (reemplazar)
- `src/components/ui/Tabs.tsx` (reemplazar)
- `src/components/ui/Toast.tsx` (nuevo)

**Criterio de aceptación**:
- Todos los componentes usan Headless UI
- Sin imports de shadcn
- Tests pasan
- Accesibilidad verificada (keyboard nav, ARIA)

---

## Fase 2: Layout Principal (Semanas 3-4)

### Semana 3: Sidebar y Header

**Objetivo**: Rediseñar la navegación principal.

**Tareas**:
1. Rediseñar `DashboardSidebar.tsx`:
   - Ancho 256px, colapsable a 64px
   - Secciones agrupadas (Principal, Proyectos, Secundario)
   - Hover states con `bg-primary/5`
   - Active indicator de 3px
2. Rediseñar `DashboardHeader.tsx`:
   - Alto 64px, fijo
   - Breadcrumbs contextuales
   - Command palette (⌘K)
   - Notifications + avatar dropdown
3. Crear `MobileNav.tsx`:
   - Bottom navigation 5 tabs
   - Swipe gestures
4. Actualizar layout principal

**Archivos a crear/modificar**:
- `src/features/dashboard/DashboardSidebar.tsx` (reemplazar)
- `src/features/dashboard/DashboardHeader.tsx` (reemplazar)
- `src/features/dashboard/MobileNav.tsx` (reemplazar)
- `src/app/layout.tsx` (modificar)

**Criterio de aceptación**:
- Sidebar colapsa correctamente
- Header muestra breadcrumbs
- Mobile nav funciona
- Transiciones suaves (200ms)

---

### Semana 4: Command Palette

**Objetivo**: Agregar búsqueda global con ⌘K.

**Tareas**:
1. Crear `CommandPalette.tsx`:
   - Búsqueda por comandos
   - Navegación por teclado
   - Filtros por categoría
2. Integrar con keyboard shortcuts
3. Agregar acciones frecuentes:
   - Nueva auditoría
   - Ir a proyecto
   - Configuración
   - Ayuda

**Archivos a crear**:
- `src/components/CommandPalette.tsx` (nuevo)
- `src/hooks/useKeyboardShortcuts.ts` (nuevo)

**Criterio de aceptación**:
- ⌘K abre/cierra palette
- Búsqueda funciona
- Navegación por teclado funciona
- Cierra con Escape

---

## Fase 3: Dashboard y Proyectos (Semanas 5-6)

### Semana 5: Dashboard Principal

**Objetivo**: Rediseñar la vista principal.

**Tareas**:
1. Rediseñar `page.tsx` (dashboard):
   - Bienvenida personalizada
   - 4 metric cards (Proyectos, Auditorías, Uptime, Alertas)
   - Timeline de actividad reciente
   - Top proyectos con score gauge
2. Crear `ScoreGauge.tsx`:
   - Gauge circular animado
   - Color dinámico por score
3. Crear `ActivityTimeline.tsx`:
   - Lista cronológica de eventos
   - Badges por tipo de evento

**Archivos a crear/modificar**:
- `src/app/page.tsx` (reemplazar)
- `src/components/ui/ScoreGauge.tsx` (nuevo)
- `src/components/ActivityTimeline.tsx` (nuevo)
- `src/components/MetricCard.tsx` (nuevo)

**Criterio de aceptación**:
- Dashboard carga en <2s
- Score gauge anima al cargar
- Timeline muestra últimos 10 eventos
- Responsive en mobile

---

### Semana 6: Detalle de Proyecto

**Objetivo**: Rediseñar la vista de proyecto individual.

**Tareas**:
1. Rediseñar `projects/[id]/page.tsx`:
   - Header con nombre + dominio + badges
   - Tabs: Overview | Auditorías | Inteligencia | Config
   - Overview con métricas principales
2. Crear `ProjectScoreCard.tsx`:
   - Score gauge grande
   - Scores por categoría (SEO, Seguridad, Rendimiento)
3. Actualizar `AuditControl.tsx`:
   - Modal de nueva auditoría con configuración
   - Progress bar durante ejecución
4. Actualizar `RumIntegrationCard.tsx`:
   - Estado del beacon
   - Instructions para integración

**Archivos a crear/modificar**:
- `src/app/projects/[id]/page.tsx` (reemplazar)
- `src/components/ProjectScoreCard.tsx` (nuevo)
- `src/app/projects/[id]/components/AuditControl.tsx` (modificar)
- `src/app/projects/[id]/components/RumIntegrationCard.tsx` (modificar)

**Criterio de aceptación**:
- Tabs navegan correctamente
- Score gauge muestra datos reales
- Modal de auditoría funciona
- Responsive en mobile

---

## Fase 4: Flujos de Auditoría (Semanas 7-8)

### Semana 7: Inicio y Progreso de Auditoría

**Objetivo**: Mejorar UX de inicio y monitoreo.

**Tareas**:
1. Rediseñar modal de nueva auditoría:
   - Tipo de auditoría (checkboxes)
   - Configuración (profundidad, user agent)
   - Preview de estimación
2. Crear `AuditProgress.tsx`:
   - Progress bar animada
   - Stats en tiempo real (páginas, tiempo)
   - Cancel button
3. Crear `AuditStatusBadge.tsx`:
   - Badge con estado (pendiente, ejecutando, completado, fallido)

**Archivos a crear**:
- `src/components/AuditProgress.tsx` (nuevo)
- `src/components/AuditStatusBadge.tsx` (nuevo)

**Criterio de aceptación**:
- Modal muestra preview
- Progress bar actualiza en tiempo real
- Cancel funciona
- Estados se muestran correctamente

---

### Semana 8: Resultados de Auditoría

**Objetivo**: Mejorar visualización de resultados.

**Tareas**:
1. Rediseñar `projects/[id]/audits/[auditId]/page.tsx`:
   - Score summary
   - Issues por severidad (expandibles)
   - Filtros y búsqueda
   - Exportaciones
2. Crear `IssueCard.tsx`:
   - Expandible con páginas afectadas
   - Severity badge
   - Acciones (fixed, ignorar)
3. Crear `AuditExportPanel.tsx`:
   - PDF, CSV, informe completo
   - Estados de exportación

**Archivos a crear/modificar**:
- `src/app/projects/[id]/audits/[auditId]/page.tsx` (reemplazar)
- `src/components/IssueCard.tsx` (nuevo)
- `src/components/AuditExportPanel.tsx` (nuevo)

**Criterio de aceptación**:
- Issues se expanden correctamente
- Filtros funcionan
- Exportaciones generan archivos
- Responsive en mobile

---

## Fase 5: Portal Cliente (Semanas 9-10)

### Semana 9: Portal Cliente

**Objetivo**: Rediseñar el portal para clientes.

**Tareas**:
1. Rediseñar `p/[token]/page.tsx`:
   - Resumen ejecutivo con scores
   - Tendencia (gráfico de línea)
   - Últimas auditorías
   - Exportaciones
2. Crear `ClientScoreCard.tsx`:
   - Score general + por categoría
   - Tendencia visual
3. Crear `TrendChart.tsx`:
   - Gráfico de línea de score historical

**Archivos a crear/modificar**:
- `src/app/p/[token]/page.tsx` 
