# SCAUDIT Pro — Design System & Theme Guide

> **Versión:** 2.0 · **Motor:** Tailwind CSS v4 + OKLCH · **Última actualización:** Julio 2026

---

## Tabla de contenidos

1. [Design DNA](#1-design-dna)
2. [Paleta de color (OKLCH)](#2-paleta-de-color-oklch)
3. [Tipografía](#3-tipografía)
4. [Glass utilities](#4-glass-utilities)
5. [Animaciones](#5-animaciones)
6. [Patrones de layout](#6-patrones-de-layout)
7. [Semántica de color por severidad](#7-semántica-de-color-por-severidad)
8. [Tokens heredados (no usar)](#8-tokens-heredados-no-usar)
9. [Checklist de migración](#9-checklist-de-migración)

---

## 1. Design DNA

**SCAUDIT Pro** es una plataforma de inteligencia de red y ciberseguridad enterprise. Su identidad visual se inspira en el interior de un data center industrial — precisión de instrumentos, pantallas de radar, interfaces de terminal. No es un producto de consumo; debe sentirse como una herramienta de ingeniería.

| Atributo | Valor |
|----------|-------|
| Personalidad | Forense, técnica, profesional |
| Referencia visual | Server racks, consolas de monitoreo, dashboards SOC |
| Riesgo estético | Ser demasiado genérico (dark mode + emerald) |
| Acento único | **Chartreuse** — usado con extrema moderación como marcador de "señal viva" |

### Principios

- **Jerarquía de contenido**: Los valores numéricos y los estados son lo primero. El decorado es secundario.
- **Contención**: El fondo near-black (`oklch(1.8%)`) y los bordes sutiles crean un espacio de trabajo profundo y sin distracciones.
- **Un solo acento**: Chartreuse exclusivamente para indicadores de estado positivo/activo. Sin paletas multicolor.
- **Tipografía expresiva**: DM Sans para displays y datos grandes — la tipografía *es* el diseño.

---

## 2. Paleta de color (OKLCH)

Todos los colores se definen en el espacio de color **OKLCH** para garantizar consistencia perceptual en cualquier pantalla.

### Tokens CSS (`:root` en `globals.css`)

```css
--bg:        oklch(1.8% 0.003 265);   /* near-black con tinte índigo */
--fg:        oklch(93% 0.008 265);     /* texto principal (blanco roto) */
--card:      oklch(3% 0.006 265);      /* fondo de cards */
--muted:     oklch(6% 0.005 265);      /* superficie secundaria */
--primary:   oklch(68% 0.14 230);      /* índigo — acciones, iconos activos */
--accent:    oklch(78% 0.18 140);      /* chartreuse — señal viva */
--destructive: oklch(55% 0.22 25);     /* rojo — errores */
--border:    oklch(15% 0.008 265);     /* borde de cards */
--input:     oklch(12% 0.006 265);     /* borde de inputs */
--muted-fg:  oklch(35% 0.02 260);      /* texto secundario */
--radius:    12px;                      /* radio base */
--ring:      oklch(68% 0.14 230);      /* focus ring */
```

### Tokens Tailwind (`@theme inline` en `globals.css`)

| Clase | Color resultante |
|-------|------------------|
| `bg-background` | `oklch(1.8% 0.003 265)` |
| `text-foreground` | `oklch(93% 0.008 265)` |
| `bg-card` | `oklch(3% 0.006 265)` |
| `bg-muted` | `oklch(6% 0.005 265)` |
| `text-muted-fg` | `oklch(35% 0.02 260)` |
| `text-primary` / `bg-primary` | `oklch(68% 0.14 230)` |
| `text-chartreuse` / `bg-chartreuse` | `oklch(78% 0.18 140)` |
| `text-destructive` / `bg-destructive` | `oklch(55% 0.22 25)` |
| `border-border` | `oklch(15% 0.008 265)` |

### Opacidad

Los tokens aceptan el modificador `/opacity`:

```jsx
// Correcto
<div className="bg-primary/10 text-primary">Badge</div>
<div className="border-border/50">Borde semi-transparente</div>
<div className="text-muted-fg/80">Texto secundario más visible</div>
```

### Mapa de migración desde la paleta legacy

| Color antiguo | Token DS | Ejemplo de uso |
|--------------|----------|----------------|
| `text-cyan-400/500` | `text-primary` | Links, iconos activos |
| `bg-cyan-500/10` | `bg-primary/10` | Badges active |
| `text-emerald-400/500` | `text-chartreuse` | Live dot, success |
| `bg-emerald-500/10` | `bg-chartreuse/10` | Status badge |
| `text-rose-400/500` | `text-destructive` | Critical severity |
| `bg-rose-500/10` | `bg-destructive/10` | Error banners |
| `text-amber-400` | `text-[oklch(75% 0.13 80)]` | Warning severity |
| `text-zinc-500/400` | `text-muted-fg` | Labels, captions |
| `text-zinc-300` | `text-foreground/80` | Secondary text |
| `text-white` | `text-foreground` | Texto principal |
| `bg-white/[0.02]` | `bg-muted/10` | Hover backgrounds |
| `border-white/[0.06]` | `border-border` | Bordes de cards |
| `border-white/[0.04]` | `border-border/50` | Bordes secundarios |
| `shadow-[0_8px_30px_rgb(0,0,0,0.5)]` | removido (usa `glass-card`) | Sombras de elevación |
| `#06b6d4` / `#22d3ee` | `oklch(68% 0.14 230)` | SVG / CSS-in-JS |
| `#10b981` | `oklch(78% 0.18 140)` | Indicadores de éxito |

---

## 3. Tipografía

### Stack tipográfico

| Rol | Fuente | Variable CSS | Clase | Pesos cargados |
|-----|--------|-------------|-------|----------------|
| **Display** | DM Sans | `--font-display` | `font-display` | 400-1000 |
| **Body** | Inter | `--font-inter` | `font-sans` | 400-800 |
| **Mono** | JetBrains Mono | `--font-mono` | `font-mono` | 400-600 |

### Reglas globales

```css
body { font-family: var(--font-inter); letter-spacing: -0.012em; }
h1, h2, h3, h4, .font-display { font-family: var(--font-display); }
```

### Buenas prácticas

```jsx
// DM Sans automático en headings
<h3 className="font-extrabold text-foreground text-sm tracking-tight">
// font-display para títulos que no sean <h1-4>
<span className="font-display font-extrabold text-2xl">
// Tablas de datos siempre en font-mono
<span className="font-mono text-xs text-foreground/80">
```

---

## 4. Glass utilities

Son la base de todas las superficies del dashboard. Reemplazan los patrones legacy de `backdrop-blur-xl border border-white/[0.06] bg-white/[0.01] shadow-[0_8px_30px]`.

### `glass-panel`

Fondo translúcido uniforme sin gradiente. Para sidebars, headers.

```jsx
<aside className="glass-panel">...</aside>
```

### `glass-card`

Card estándar con gradiente sutil y sombra. Para contenido general.

```jsx
<div className="glass-card rounded-2xl p-6">...</div>
<div className="glass-card rounded-xl p-5">...</div>
```

### `glass-card-hero`

Card destacada con glow sutil de primary. Para la hero section de cada tab.

```jsx
<div className="glass-card-hero rounded-2xl p-6 sm:p-8">...</div>
```

> ⚠️ **No añadir** `backdrop-blur`, `shadow-lg`, ni `shadow-[0_8px_30px]` junto a estas utilities — ya lo manejan internamente.

---

## 5. Animaciones

### Keyframes globales

| Animación | Duración | Timing | Uso |
|-----------|----------|--------|-----|
| `scan-pulse` | 2.2s | ease-in-out | Badge "Live", indicadores |
| `pulse-beat` | 2s | ease-in-out | Status dot del hero |
| `fade-in` | 0.3s | ease-out | Entrada de elementos |
| `slide-in-right` | 0.3s | ease-out | Paneles laterales |
| `scale-check` | 0.35s | cubic-bezier | ✓ animación de copiado |
| `message-in` | 0.3s | cubic-bezier | Toasts |
| `shimmer` | 2.5s | linear | Skeleton loaders |

### Uso

```jsx
<span className="w-1.5 h-1.5 rounded-full bg-chartreuse scan-pulse" />
<div className="animate-in fade-in duration-300">...</div>
```

> ❌ No crear keyframes inline en `<style>` dentro del componente. No usar `phosphor-text-glow`, `custom-scrollbar` (eliminados).

---

## 6. Patrones de layout

### Bento grid (2fr + 1fr)

```jsx
<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
  <div className="lg:col-span-2 glass-card rounded-2xl p-6">...</div>
  <div className="glass-card rounded-2xl p-6">...</div>
</div>
```

### Cards 2×2

```jsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  <div className="glass-card rounded-xl p-5">...</div>
  <div className="glass-card rounded-xl p-5">...</div>
  <div className="glass-card rounded-xl p-5">...</div>
  <div className="glass-card rounded-xl p-5">...</div>
</div>
```

### Espaciado estándar

| Contexto | Clase | Valor |
|----------|-------|-------|
| Entre secciones | `space-y-8` | 32px |
| Entre cards en grid | `gap-6` | 24px |
| Padding interno de card | `p-6` (rounded-2xl) | 24px |
| Padding interno de car
