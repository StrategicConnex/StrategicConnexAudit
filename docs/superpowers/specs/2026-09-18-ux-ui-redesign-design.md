# SCAUDIT Pro — Rediseño UX/UI Completo

**Fecha**: 2026-09-18
**Autor**: Buffy (Codebuff)
**Estado**: Aprobado
**Enfoque**: Incremental con Headless UI

---

## 1. Resumen Ejecutivo

Rediseño completo de la experiencia de usuario de SCAUDIT Pro para resolver dos pain points principales:
- **UI poco atractiva visualmente** → Dirección corporativo/profesional
- **Confusa/sobrecargada** → Mejorar claridad y navegación

**Audiencia**: Equipo interno (SEO/marketing) + Clientes (portal)
**Timeline**: Sin límite de tiempo
**Design System**: Migrar de shadcn a Headless UI + Tailwind

---

## 2. Enfoque: Rediseño Incremental

### 2.1 Estrategia

Migrar componentes shadcn → Headless UI **módulo por módulo**:
1. Crear design system base (tokens, componentes)
2. Migrar layout principal (sidebar, header)
3. Migrar dashboard y vistas de proyecto
4. Migrar flujos de auditoría
5. Migrar portal cliente
6. Optimizar mobile y accesibilidad

### 2.2 Ventajas del Enfoque Incremental

- Sin downtime ni breaking changes
- Cada entrega es un PR mergeable
- Priorización por impacto visual
- Headless UI se integra perfectamente con Tailwind
- Rollback fácil si algo falla

---

## 3. Design System & Tokens

### 3.1 Paleta de Colores Corporativa

| Token | Valor | Uso |
|-------|-------|-----|
| `--color-primary` | `#1E3A5F` (azul profundo) | Acciones principales, headers |
| `--color-primary-light` | `#2563EB` | Hover states, links |
| `--color-accent` | `#D4A843` (dorado) | Badges premium, highlights |
| `--color-success` | `#059669` | Estados positivos |
| `--color-warning` | `#D97706` | Advertencias |
| `--color-danger` | `#DC2626` | Errores, alertas críticas |
| `--color-surface` | `#F8FAFC` | Fondo principal |
| `--color-surface-elevated` | `#FFFFFF` | Cards, modales |
| `--color-border` | `#E2E8F0` | Bordes sutiles |
| `--color-text-primary` | `#0F172A` | Texto principal |
| `--color-text-secondary` | `#64748B` | Texto secundario |

### 3.2 Tipografía

| Elemento | Font | Size | Weight |
|----------|------|------|--------|
| Display | DM Sans | 36px | 800 |
| H1 | DM Sans | 28px | 700 |
| H2 | DM Sans | 22px | 700 |
| H3 | DM Sans | 18px | 600 |
| Body | DM Sans | 14px | 400 |
| Caption | DM Sans | 12px | 500 |
| Mono | JetBrains Mono | 13px | 400 |

### 3.3 Espaciado y Grid

- **Grid base**: 4px
- **Spacing scale**: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64
- **Border radius**: `sm=6px`, `md=8px`, `lg=12px`, `xl=16px`
- **Card shadow**: `0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)`

### 3.4 Componentes Base (Headless UI)

- `Dialog` → Modales
- `Menu` → Dropdowns
- `Listbox` → Selects
- `Switch` → Toggles
- `Tabs` → Navegación por pestañas
- `Disclosure` → Accordions
- `Popover` → Tooltips/popups
- `Transition` → Animaciones suaves

---

## 4. Layout & Navegación

### 4.1 Estructura General

```
┌─────────────────────────────────────────────────────┐
│ Header (fixed, h-16)                                │
│ [Logo] [Breadcrumbs]           [Search] [🔔] [👤]  │
├──────────┬──────────────────────────────────────────┤
│ Sidebar  │ Content Area                             │
│ (w-256)  │                                          │
│          │  Page Content                            │
└──────────┴──────────────────────────────────────────┘
```

### 4.2 Sidebar

- **Ancho**: 256px (colapsable a 64px con iconos)
- **Secciones**:
  - **Principal**: Dashboard, Auditorías, Inteligencia, Configuración
  - **Proyectos**: Lista de proyectos (scrollable)
  - **Secundario**: Docs, Seguridad, Equipo
- **Footer**: Theme toggle, settings rápido
- **Hover**: Highlight sutil con `bg-primary/5`
- **Active**: Indicador lateral de 3px + bg `bg-primary/10`

### 4.3 Header

- **Alto**: 64px, fijo arriba
- **Izquierda**: Logo + breadcrumbs contextuales
- **Centro**: Command palette (⌘K)
- **Derecha**: Notifications, avatar con dropdown
- **Borde inferior**: `border-border/50`

### 4.4 Responsive (Mobile)

- Sidebar → Bottom navigation (5 tabs principales)
- Header simplificado: Logo + hamburger
- Content a pantalla completa
- Cards se apilan verticalmente

---

## 5. Dashboard & Vistas de Proyecto

### 5.1 Dashboard Principal (`/`)

- **Bienvenida**: Nombre del usuario + último acceso
- **Resumen Rápido**: 4 cards (Proyectos, Auditorías, Uptime, Alertas)
- **Actividad Reciente**: Timeline de eventos
- **Top Proyectos**: Cards con score gauge animado

### 5.2 Detalle de Proyecto (`/projects/[id]`)

- **Header**: Nombre + dominio + badges (SOC2, OWASP)
- **Tabs**: Overview | Auditorías | Inteligencia | Configuración
- **Overview**:
  - Score gauge animado (0-100)
  - Core Web Vitals cards (LCP, CLS, FCP, INP)
  - Uptime status con timeline
  - Últimas auditorías (lista)
  - RUM integration card

### 5.3 Cards de Proyecto

- **Hover**: Elevación sutil + borde `border-primary/20`
- **Score**: Gauge circular con color dinámico
- **Badges**: Pill badges con colores por severidad
- **Loading**: Skeleton shimmer animation

---

## 6. Flujos de Auditoría

### 6.1 Flujo Completo

1. **Inicio**: Modal de configuración (tipo, profundidad, user agent)
2. **Progreso**: Página con tiempo real (progress bar, estadísticas)
3. **Resultados**: Score, issues por severidad, exportaciones

### 6.2 Estados de Auditoría

| Estado | Visual | Acción |
|--------|--------|--------|
| Pendiente | Punto gris | — |
| Ejecutando | Punto pulsante cyan | Progress bar |
| Completado | Punto verde | Ver resultados |
| Fallido | Punto rojo | Reintentar |
| Cancelado | Punto amarillo | — |

### 6.3 Detalle de Issue

- **Expandible**: Click para ver páginas afectadas
- **Severity badge**: Color-coded pills
- **Acciones**: Marcar como "fixed", ignorar, exportar
- **Filtros**: Severidad, categoría, página

---

## 7. Portal Cliente & Reportes

### 7.1 Portal Cliente (`/p/[token]`)

- **Resumen Ejecutivo**: Score general + scores por categoría
- **Tendencia**: Gráfico de línea (últimos 30 días)
- **Últimas Auditorías**: Lista cronológica
- **Exportar**: PDF Ejecutivo, CSV Detallado, Informe Completo

### 7.2 Generación de Reportes

- **PDF Ejecutivo**: 1-2 páginas, resumen para C-level
- **CSV Detallado**: Datos crudos para análisis
- **Informe Completo**: PDF multi-página con gráficos

### 7.3 Estados de Exportación

| Estado | Visual | Acción |
|--------|--------|--------|
| Pendiente | Spinner | — |
| Generando | Progress bar | Esperar |
| Listo | Badge verde | Descargar |
| Error | Badge rojo | Reintentar |

### 7.4 Notificaciones

- **In-app**: Toast notifications (esquina superior derecha)
- **Email**: Resumen semanal de cambios
- **Telegram**: Alertas críticas (si está configurado)

---

## 8. Mobile & Accesibilidad

### 8.1 Responsive Breakpoints

| Breakpoint | Ancho | Comportamiento |
|------------|-------|----------------|
| `sm` | 640px | Tablet portrait |
| `md` | 768px | Tablet landscape |
| `lg` | 1024px | Desktop |
| `xl` | 1280px | Desktop amplio |
| `2xl` | 1536px | Ultrawide |

### 8.2 Mobile (`< 768px`)

- **Bottom nav**: 5 tabs principales
- **Cards**: Stack vertical, full-width
- **Tables**: Scroll horizontal o cards
- **Modals**: Full-screen en mobile

### 8.3 Accesibilidad (WCAG 2.1 AA)

- **Contraste**: Mínimo 4.5:1 para texto, 3:1 para UI
- **Focus visible**: Ring de 2px en todos los interactive elements
- **Keyboard navigation**: Tab order lógico, Escape cierra modales
- **Screen readers**: Labels en todos los inputs, ARIA landmarks
- **Motion**: `prefers-reduced-motion` respeta preferencias del usuario

### 8.4 Animaciones

| Elemento | Animación | Duración |
|----------|-----------|----------|
| Page transitions | Fade + slide | 200ms |
| Card hover | Elevación + borde | 150ms |
| Modal open | Scale + fade | 200ms |
| Loading skeleton | Shimmer | 1.5s loop |
| Toast notifications | Slide in from right | 300ms |

---

## 9. Migración Técnica

### 9.1 Componentes a Migrar

| shadcn Component | Headless UI Equivalent | Prioridad |
|------------------|------------------------|-----------|
| `Dialog` | `Dialog` | Alta |
| `DropdownMenu` | `Menu` | Alta |
| `Select` | `Listbox` | Alta |
| `Switch` | `Switch` | Alta |
| `Tabs` | `Tabs` | Alta |
| `Accordion` | `Disclosure` | Media |
| `Tooltip` / `Popover` | `Popover` | Media |
| `Toast` | `Transition` | Baja |
