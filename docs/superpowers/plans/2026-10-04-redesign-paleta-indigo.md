# Rediseño de Paleta "Slate + Indigo + Teal" (v5) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el acento dorado por índigo "Signal" (#60A5FA dark / #2563EB light), aclarar el modo oscuro de oklch(4%) a oklch(14%) pizarra y atenuar el modo claro de oklch(96%) a oklch(92%), según el spec aprobado `docs/superpowers/specs/2026-10-04-redesign-paleta-indigo-design.md`.

**Architecture:** El design system es CSS-first (Tailwind v4, tokens OKLCH en `@theme inline`). Casi todo el cambio ocurre redefiniendo los tokens de `globals.css` y `design-tokens.css`; los componentes que leen tokens se actualizan solos. Solo se tocan componentes donde el dorado está hardcodeado (ScoreGauge, GeoMap, AttackSurfaceGraph, defaults de white-label, usos semánticos de `chartreuse`).

**Tech Stack:** Next.js 16 (App Router), Tailwind CSS v4 (CSS-first), OKLCH tokens, Vitest + Testing Library, Playwright.

**Spec de referencia:** `docs/superpowers/specs/2026-10-04-redesign-paleta-indigo-design.md` (valores token a token — este plan los reproduce completos).

## Global Constraints

- **Rama de trabajo:** `redesign/paleta-indigo` (ya creada, spec comprometido en `64c6f8f`). NO trabajar en `main`.
- **Gestor de paquetes:** pnpm. Entorno Windows: ejecutar comandos en Git Bash desde `strategicaudit-pro/`.
- **Severidad intocable:** los hues de rojo/ámbar/verde (25/85/150 en OKLCH) no cambian; las clases crudas semánticas (`text-red-500`, `bg-green-600`, `text-amber-400`…) NO se tocan.
- **`--chartreuse` conserva su nombre** (263 usos en TSX); solo cambia su valor a índigo.
- **Teal secundario (hue 185) y acentos multi-hue data-viz** (`--accent-blue/purple/cyan/indigo/violet`): sin cambio.
- **Fuentes, layout, glassmorphism estructural, animaciones:** sin cambio.
- **Contraste:** texto ≥ 4.5:1, elementos gráficos ≥ 3:1, sobre ambos temas.
- **Criterio de aceptación global:** `grep -rniE "#d4a843|#eba52d|#e3c167|#e5a83b" src/ --include="*.ts*"` devuelve 0 resultados al terminar.

---

### Task 1: Redefinir tokens OKLCH (dark + light) y acentos corporativos

**Files:**
- Modify: `src/app/globals.css:7-18` (cabecera), `:126-209` (bloque dark), `:214-287` (bloque light), `:336-339` (hero-scan)
- Modify: `src/styles/design-tokens.css:25,52` (corporate-accent)

**Interfaces:**
- Consumes: nada (primer task).
- Produces: los tokens `--primary`, `--ring`, `--chartreuse`, `--chart-primary`, `--neural-*`, `--selection-*`, etc. con valores índigo/pizarra que consumen TODOS los tasks siguientes y los 263 usos de `chartreuse`.

- [ ] **Step 1: Reemplazar la cabecera del DS (líneas 7-18)**

Sustituir el comentario de diseño:

```css
/* ═══════════════════════════════════════════════════════════════════════════
   SCAUDIT — Enterprise Cyber Intelligence Design System v5
   Tailwind CSS v4 with OKLCH color tokens.

   Design DNA: Slate + Indigo + Teal NOC — the war-room of a network
   operations center at night. Graphite-slate backgrounds (not pure black),
   indigo as the single saturated accent (live signals, primary actions,
   focus), teal as the secondary data hue. Multi-hue accents are reserved
   for data-viz. Severity hues (red/amber/green) are semantic and stable.

   Font stack: Space Grotesk (display/data), Inter (body/UI), JetBrains Mono
   (terminal/code).
   ═══════════════════════════════════════════════════════════════════════════ */
```

- [ ] **Step 2: Reemplazar el bloque dark completo (líneas 126-209)**

Sustituir TODO el bloque `:root, [data-theme="dark"] { ... }` por:

```css
:root,
[data-theme="dark"] {
  --bg: oklch(14% 0.012 260);
  --fg: oklch(93% 0.005 260);
  --card: oklch(18% 0.014 260);
  --card-fg: oklch(93% 0.005 260);
  --popover: oklch(18% 0.014 260);
  --popover-fg: oklch(93% 0.005 260);
  --primary: oklch(71% 0.14 258);
  --primary-fg: oklch(16% 0.04 262);
  --secondary: oklch(55% 0.08 185);
  --secondary-fg: oklch(95% 0.005 260);
  --muted: oklch(21% 0.014 260);
  /* text-muted-fg/text-muted-foreground — AA sobre --bg (≈5.5:1). */
  --muted-fg: oklch(65% 0.015 260);
  --accent: oklch(58% 0.10 185);
  --accent-fg: oklch(95% 0.005 260);
  --destructive: oklch(60% 0.22 25);
  --destructive-fg: oklch(98% 0.005 265);
  --border: oklch(26% 0.015 260);
  --input: oklch(19% 0.013 260);
  --ring: oklch(71% 0.14 258);
  --radius: 12px;

  /* Superficies — jerarquía background → surface → elevated → muted → overlay */
  --surface: oklch(15.5% 0.013 260);
  --surface-elevated: oklch(19% 0.014 260);
  --surface-muted: oklch(21.5% 0.014 260);
  --surface-overlay: oklch(16% 0.013 260 / 0.78);
  --overlay: oklch(0% 0 0 / 0.55);

  /* Acento de marca (nombre histórico --chartreuse, valor índigo Signal) */
  --chartreuse: oklch(71% 0.14 258);

  /* Charts / data-viz */
  --chart-grid: oklch(30% 0.012 260 / 0.5);
  /* Ejes 50%: ≥3:1 sobre --bg (elementos no-texto). */
  --chart-axis: oklch(58% 0.015 260);
  --chart-label: oklch(68% 0.012 260);
  --chart-primary: oklch(71% 0.14 258);
  --chart-secondary: oklch(60% 0.10 185);
  --chart-success: oklch(65% 0.13 150);
  --chart-warning: oklch(75% 0.13 85);
  --chart-danger: oklch(60% 0.20 25);
  --chart-tooltip: oklch(12% 0.014 260 / 0.95);

  /* Glass + shadows + gradients */
  --glass-border: oklch(30% 0.015 260 / 0.5);
  --glass-border-strong: oklch(71% 0.14 258 / 0.10);
  --shadow-card: 0 8px 30px -8px oklch(0% 0 0 / 0.75);
  --shadow-hero: 0 12px 40px -12px oklch(71% 0.14 258 / 0.10),
                inset 0 1px 0 oklch(100% 0 0 / 0.03);
  --gradient-surface: linear-gradient(160deg, oklch(19% 0.013 260 / 0.75), oklch(15% 0.011 260 / 0.85));
  --gradient-surface-hero: linear-gradient(160deg, oklch(20% 0.014 260 / 0.85), oklch(16% 0.012 260 / 0.9));
  --gradient-primary: linear-gradient(135deg, oklch(64% 0.14 260), oklch(50% 0.12 265));
  --gradient-accent: linear-gradient(135deg, oklch(55% 0.10 185), oklch(45% 0.08 170));

  /* Fondo de red neuronal — índigo Signal.
     Opacidad base = móvil (menos densa); sm/lg la suben vía media query. */
  --neural-node: #60A5FA;
  --neural-node-glow: rgba(96, 165, 250, 0.55);
  --neural-line: rgba(96, 165, 250, 0.35);
  --neural-canvas-opacity: 0.35;

  /* Acentos multi-hue — brillantes sobre dark (sin cambio) */
  --accent-blue: oklch(68% 0.10 240);
  --accent-purple: oklch(60% 0.10 300);
  --accent-cyan: oklch(65% 0.10 190);
  --accent-indigo: oklch(58% 0.12 265);
  --accent-violet: oklch(55% 0.12 285);

  /* Efectos atmosféricos */
  --grid-line: oklch(100% 0 0 / 0.012);
  --shimmer-a: oklch(100% 0 0 / 0.025);
  --shimmer-b: oklch(100% 0 0 / 0.07);
  --scan-line: rgba(255, 255, 255, 0.01);
  --selection-bg: oklch(71% 0.14 258 / 0.18);
  --selection-fg: oklch(93% 0.005 260);
  --scroll-thumb: oklch(30% 0.015 260);
  --scroll-thumb-hover: oklch(38% 0.015 260);
}
```

- [ ] **Step 3: Reemplazar el bloque light completo (líneas 214-287)**

Sustituir TODO el bloque `[data-theme="light"] { ... }` por:

```css
[data-theme="light"] {
  --bg: oklch(92% 0.006 260);
  --fg: oklch(20% 0.015 260);
  --card: oklch(97% 0.003 260);
  --card-fg: oklch(20% 0.015 260);
  --popover: oklch(97% 0.003 260);
  --popover-fg: oklch(20% 0.015 260);
  --primary: oklch(54% 0.20 262);
  --primary-fg: oklch(98.5% 0.002 260);
  --secondary: oklch(88% 0.015 185);
  --secondary-fg: oklch(20% 0.02 260);
  --muted: oklch(88.5% 0.006 260);
  /* AA sobre superficies claras (≈5:1) */
  --muted-fg: oklch(38% 0.02 260);
  --accent: oklch(40% 0.08 185);
  --accent-fg: oklch(98% 0.003 260);
  --destructive: oklch(52% 0.21 25);
  --destructive-fg: oklch(99% 0.003 100);
  --border: oklch(83% 0.008 260);
  --input: oklch(88% 0.006 260);
  --ring: oklch(54% 0.20 262);
  --radius: 12px;

  --surface: oklch(96.5% 0.004 260);
  --surface-elevated: oklch(98% 0.003 260);
  --surface-muted: oklch(89% 0.006 260);
  --surface-overlay: oklch(96% 0.004 260 / 0.85);
  --overlay: oklch(20% 0.02 260 / 0.45);

  --chartreuse: oklch(54% 0.20 262);

  --chart-grid: oklch(84% 0.01 260 / 0.7);
  --chart-axis: oklch(52% 0.015 260);
  --chart-label: oklch(42% 0.015 260);
  --chart-primary: oklch(54% 0.20 262);
  --chart-secondary: oklch(40% 0.08 185);
  --chart-success: oklch(42% 0.12 150);
  --chart-warning: oklch(55% 0.14 85);
  --chart-danger: oklch(52% 0.21 25);
  --chart-tooltip: oklch(98% 0.003 260 / 0.97);

  --glass-border: oklch(83% 0.008 260 / 0.75);
  --glass-border-strong: oklch(54% 0.20 262 / 0.16);
  --shadow-card: 0 8px 24px -8px oklch(25% 0.02 260 / 0.12);
  --shadow-hero: 0 12px 40px -12px oklch(54% 0.20 262 / 0.16),
                 inset 0 1px 0 oklch(100% 0 0 / 0.85);
  --gradient-surface: linear-gradient(160deg, oklch(98% 0.003 260 / 0.9), oklch(93.5% 0.005 260 / 0.92));
  --gradient-surface-hero: linear-gradient(160deg, oklch(98.5% 0.003 260 / 0.92), oklch(94% 0.005 260 / 0.95));
  --gradient-primary: linear-gradient(135deg, oklch(54% 0.20 262), oklch(44% 0.16 265));
  --gradient-accent: linear-gradient(135deg, oklch(40% 0.08 185), oklch(35% 0.07 170));

  /* Fondo de red neuronal — índigo Signal, legible sobre light. */
  --neural-node: #2563EB;
  --neural-node-glow: rgba(37, 99, 235, 0.45);
  --neural-line: rgba(37, 99, 235, 0.30);
  --neural-canvas-opacity: 0.25;

  /* Acentos multi-hue — oscuros sobre light (AA, sin cambio) */
  --accent-blue: oklch(42% 0.10 240);
  --accent-purple: oklch(38% 0.10 300);
  --accent-cyan: oklch(38% 0.08 190);
  --accent-indigo: oklch(35% 0.12 265);
  --accent-violet: oklch(35% 0.12 285);

  --grid-line: oklch(15% 0.02 260 / 0.06);
  --shimmer-a: oklch(15% 0.02 260 / 0.04);
  --shimmer-b: oklch(15% 0.02 260 / 0.09);
  --scan-line: oklch(15% 0.02 260 / 0.05);
  --selection-bg: oklch(54% 0.20 262 / 0.16);
  --selection-fg: oklch(20% 0.015 260);
  --scroll-thumb: oklch(78% 0.008 260);
  --scroll-thumb-hover: oklch(68% 0.01 260);
}
```

- [ ] **Step 4: Actualizar la utilidad hero-scan (líneas ~336-339)**

Sustituir el gradiente del `@utility hero-scan` (alphas dorados → índigo):

```css
@utility hero-scan {
  background: linear-gradient(90deg, transparent, oklch(71% 0.14 258 / 0.10) 45%, oklch(71% 0.14 258 / 0.16) 50%, oklch(71% 0.14 258 / 0.10) 55%, transparent);
  animation: hero-scan 1.4s cubic-bezier(0.4, 0, 0.2, 1) 0.15s both;
}
```

- [ ] **Step 5: Actualizar acentos corporativos (`src/styles/design-tokens.css`)**

En el bloque `:root, [data-theme="light"]` (línea 25) cambiar:

```css
  --corporate-accent: #2563EB;
```

En el bloque `[data-theme="dark"]` (línea 52) cambiar:

```css
  --corporate-accent: #60A5FA;
```

(`--corporate-primary-light` ya es `#60A5FA` — sin cambio. Resto del namespace corporate: sin cambio.)

- [ ] **Step 6: Verificar build (Tailwind compila globals.css)**

Run: `pnpm build`
Expected: compilación exitosa, 0 errores de CSS. (Si falla por un typo de sintaxis en los bloques, corregir y repetir.)

- [ ] **Step 7: Commit**

```bash
git add src/app/globals.css src/styles/design-tokens.css
git commit -m "feat(design): paleta v5 Slate + Indigo + Teal

- dark: oklch(4% oliva) -> oklch(14% pizarra); superficies/bordes elevados
- light: oklch(96% cálido) -> oklch(92% perla); card deja de ser blanco puro
- acento de marca: dorado hue 85 -> índigo Signal (#60A5FA / #2563EB)
- --chartreuse conserva nombre, valor -> índigo
- severidad (rojo/ámbar/verde), teal y multi-hue data-viz sin cambio
- corporate-accent alineado al índigo"
```

---

### Task 2: ScoreGauge — tiers semánticos tokenizados + track visible en modo claro

**Files:**
- Create: `src/features/dashboard/score-config.ts`
- Modify: `src/features/dashboard/ScoreGauge.tsx:15-21` (getScoreConfig importada), `:38` (uso), `:82-84` (stops), `:96-106` (track), `:124-141` (ticks), `:146-150` (textShadow), `:156-161` (outer glow)
- Create: `src/features/dashboard/score-config.test.ts`
- Modify: `src/app/globals.css` (añadir `--gauge-track` y `--gauge-tick` a ambos bloques)

**Interfaces:**
- Consumes: tokens `--chart-success/--chart-warning/--chart-danger` (Task 1) vía el hook existente `useChartColors()` (`src/shared/design-system/charts/use-chart-colors.ts`, expone `healthy/degraded/unhealthy`).
- Produces: `getScoreConfig(score: number, c: TierColors): ScoreConfig` y `interface TierColors { success: string; warning: string; danger: string }` desde `./score-config` — exportados y testeados.

- [ ] **Step 1: Escribir el test fallido (`src/features/dashboard/score-config.test.ts`)**

```ts
import { describe, expect, it } from "vitest";
import { getScoreConfig, type TierColors } from "./score-config";

const TIERS: TierColors = { success: "#22c55e", warning: "#eab308", danger: "#ef4444" };

describe("getScoreConfig", () => {
  it(">=85 -> Excelente con color success", () => {
    const cfg = getScoreConfig(90, TIERS);
    expect(cfg.label).toBe("Excelente");
    expect(cfg.color).toBe("#22c55e");
    expect(cfg.textColor).toBe("text-chart-success");
  });

  it("70-84 -> Bueno con color success", () => {
    const cfg = getScoreConfig(75, TIERS);
    expect(cfg.label).toBe("Bueno");
    expect(cfg.color).toBe("#22c55e");
  });

  it("50-69 -> Advertencia con color warning (ámbar semántico)", () => {
    const cfg = getScoreConfig(60, TIERS);
    expect(cfg.label).toBe("Advertencia");
    expect(cfg.color).toBe("#eab308");
    expect(cfg.textColor).toBe("text-chart-warning");
  });

  it("30-49 -> Crítico con color danger", () => {
    const cfg = getScoreConfig(40, TIERS);
    expect(cfg.label).toBe("Crítico");
    expect(cfg.color).toBe("#ef4444");
    expect(cfg.textColor).toBe("text-destructive");
  });

  it("<30 -> Peligro con color danger", () => {
    const cfg = getScoreConfig(10, TIERS);
    expect(cfg.label).toBe("Peligro");
    expect(cfg.color).toBe("#ef4444");
  });

  it("el glow usa color-mix (válido para oklch y hex)", () => {
    const cfg = getScoreConfig(90, { success: "oklch(65% 0.13 150)", warning: "#eab308", danger: "#ef4444" });
    expect(cfg.glow).toBe("color-mix(in srgb, oklch(65% 0.13 150) 50%, transparent)");
    expect(cfg.glowSoft).toBe("color-mix(in srgb, oklch(65% 0.13 150) 12%, transparent)");
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `pnpm vitest run src/features/dashboard/score-config.test.ts`
Expected: FAIL — "Cannot find module './score-config'"

- [ ] **Step 3: Crear `src/features/dashboard/score-config.ts`**

```ts
/**
 * Tiers del ScoreGauge alineados a los tokens semánticos del DS
 * (--chart-success/--chart-warning/--chart-danger). Los colores llegan
 * resueltos por tema vía useChartColors() — el tier ámbar "Advertencia"
 * es semántico (severidad), no de marca, y conserva su hue 85.
 *
 * El glow se construye con color-mix() porque los tokens llegan como
 * `oklch(...)` y no se pueden interpolar rgba() a mano.
 */

export interface TierColors {
  success: string;
  warning: string;
  danger: string;
}

export interface ScoreConfig {
  label: string;
  color: string;
  glow: string;
  glowSoft: string;
  textColor: string;
  bg: string;
}

export function getScoreConfig(score: number, c: TierColors): ScoreConfig {
  if (score >= 70) {
    return {
      label: score >= 85 ? "Excelente" : "Bueno",
      color: c.success,
      glow: `color-mix(in srgb, ${c.success} 50%, transparent)`,
      glowSoft: `color-mix(in srgb, ${c.success} 12%, transparent)`,
      textColor: "text-chart-success",
      bg: "bg-chart-success/10 border-chart-success/20",
    };
  }
  if (score >= 50) {
    return {
      label: "Advertencia",
      color: c.warning,
      glow: `color-mix(in srgb, ${c.warning} 50%, transparent)`,
      glowSoft: `color-mix(in srgb, ${c.warning} 12%, transparent)`,
      textColor: "text-chart-warning",
      bg: "bg-chart-warning/10 border-chart-warning/20",
    };
  }
  return {
    label: score >= 30 ? "Crítico" : "Peligro",
    color: c.danger,
    glow: `color-mix(in srgb, ${c.danger} 50%, transparent)`,
    glowSoft: `color-mix(in srgb, ${c.danger} 12%, transparent)`,
    textColor: "text-destructive",
    bg: "bg-destructive/10 border-destructive/20",
  };
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `pnpm vitest run src/features/dashboard/score-config.test.ts`
Expected: PASS — 6 tests

- [ ] **Step 5: Añadir `--gauge-track` y `--gauge-tick` a ambos bloques de `globals.css`**

Al final del bloque dark (antes de la llave de cierre), añadir:

```css
  /* ScoreGauge — pista y ticks del anillo (visibles en ambos temas) */
  --gauge-track: oklch(100% 0 0 / 0.07);
  --gauge-tick: oklch(100% 0 0 / 0.18);
```

Al final del bloque light, añadir:

```css
  --gauge-track: oklch(20% 0.02 260 / 0.09);
  --gauge-tick: oklch(20% 0.02 260 / 0.28);
```

- [ ] **Step 6: Rewirear `ScoreGauge.tsx`**

6a. Añadir el import del hook (junto a los imports existentes):

```ts
import { useChartColors } from '../../shared/design-system/charts/use-chart-colors';
import { getScoreConfig } from './score-config';
```

6b. ELIMINAR la función `getScoreConfig` local (líneas 15-21). En el cuerpo del componente, debajo de `const { latestFinding, assetsDiscovered } = useRealtimeMetrics(projectId);` añadir:

```ts
  const chartColors = useChartColors();
```

y sustituir `const config = getScoreConfig(score);` (línea 38) por:

```ts
  const config = getScoreConfig(score, {
    success: chartColors.healthy,
    warning: chartColors.degraded,
    danger: chartColors.unhealthy,
  });
```

6c. Sustituir los stops del gradiente (línea 83). Línea actual:

```tsx
              <stop offset="0%" stopColor={score < 50 ? '#D4373C' : score < 70 ? '#EBA52D' : '#8BC34A'} />
```

por:

```tsx
              <stop offset="0%" stopColor={score < 50 ? chartColors.unhealthy : score < 70 ? chartColors.degraded : chartColors.healthy} />
```

6d. Sustituir el stroke del track (línea 101) — de atributo a style (los atributos SVG no resuelven var()):

```tsx
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            style={{ stroke: 'var(--gauge-track)' }}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset="0"
          />
```

6e. Sustituir el stroke de los ticks (línea 137):

```tsx
                style={{ stroke: 'var(--gauge-tick)' }}
```

(eliminando el atributo `stroke="rgba(255,255,255,0.15)"` de esa `<line>`).

6f. El textShadow del centro (línea 148) ya usa `config.glow` — sin cambio de código (el valor ahora es color-mix). El outer glow ring (líneas 156-161) sustituir el hack `.replace('0.5', '0.12')`:

```tsx
          style={{
            background: `radial-gradient(circle at center, ${config.glowSoft} 0%, transparent 70%)`,
          }}
```

- [ ] **Step 7: Ejecutar tests del dashboard y build**

Run: `pnpm vitest run src/features/dashboard && pnpm build`
Expected: PASS + build exitoso. (Si algún test del dashboard pintaba los hex viejos, actualizar el assertion al nuevo valor del token.)

- [ ] **Step 8: Commit**

```bash
git add src/features/dashboard/score-config.ts src/features/dashboard/score-config.test.ts src/features/dashboard/ScoreGauge.tsx src/app/globals.css
git commit -m "feat(design): ScoreGauge con tiers tokenizados y pista visible en claro

- getScoreConfig extraído a score-config.ts con TierColors inyectables
- tiers alineados a chart-success/warning/danger (ámbar semántico intacto)
- track y ticks del anillo a --gauge-track/--gauge-tick (antes invisibles en light)
- glow vía color-mix() (compatible con tokens oklch)"
```

---

### Task 3: GeoMap y AttackSurfaceGraph — categóricos fuera del dorado

**Files:**
- Modify: `src/features/dashboard/GeoMap.tsx:29-35` (TYPE_COLORS)
- Modify: `src/features/dashboard/AttackSurfaceGraph.tsx:50` (NODE_COLORS.mx)

**Interfaces:**
- Consumes: nada de otros tasks.
- Produces: nada (cambio terminal).

**Nota de diseño (desviación documentada del spec §6.2-6.3):** los mapas `TYPE_COLORS`/`NODE_COLORS` alimentan atributos de presentación SVG (Leaflet `color`, JSX `stroke`/`fill`), donde `var()` y `color-mix()` NO se resuelven. Convertirlos a resolución runtime tocaría 8+ puntos de render por un beneficio marginal. Se usan literales equivalentes a los tokens en pantalla, elegidos para pasar 3:1 sobre AMBOS temas: hop → `#0891B2` (cyan-600, equivalente de `--accent-cyan`), mx → `#3B82F6` (blue-500, equivalente de `--accent-blue`).

- [ ] **Step 1: GeoMap — sustituir el mapa TYPE_COLORS (líneas 29-35)**

```ts
// Colores categóricos de data-viz (atributos SVG: no admiten var(), literales
// elegidos para pasar 3:1 sobre ambos temas; equivalentes a los tokens).
const TYPE_COLORS: Record<string, string> = {
  target: '#6271C4',
  asn: '#D4373C',
  hop: '#0891B2',
  cdn: '#8BC34A',
  reverse: '#71717A',
};
```

- [ ] **Step 2: AttackSurfaceGraph — sustituir solo la fila mx (línea 50)**

```ts
  mx:      { stroke: '#3B82F6', fill: 'rgba(59,130,246,0.12)', glow: 'rgba(59,130,246,0.6)', label: 'MX' },
```

(Las demás filas — `#6271C4`, `#8BC34A`, `#D4373C` — son categóricas no-doradas: sin cambio. `SEVERITY_OVERLAY` es severidad: sin cambio.)

- [ ] **Step 3: Verificar build**

Run: `pnpm build`
Expected: exitoso.

- [ ] **Step 4: Commit**

```bash
git add src/features/dashboard/GeoMap.tsx src/features/dashboard/AttackSurfaceGraph.tsx
git commit -m "feat(design): data-viz categórica sin dorado

- GeoMap hop #EBA52D -> #0891B2 (equiv. accent-cyan, 3:1 en ambos temas)
- AttackSurfaceGraph MX #EBA52D -> #3B82F6 (equiv. accent-blue)
- literales porque los atributos SVG no resuelven var()/color-mix()"
```

---

### Task 4: White-label — defaults del dorado a índigo

**Files:**
- Modify: `src/app/p/[token]/page.tsx:69`
- Modify: `src/components/ClientScoreCard.tsx:19`
- Modify: `src/components/TrendChart.tsx:39`
- Modify: `src/features/dashboard/AgencySection.tsx:16,138`
- Modify: `src/app/actions/projects.ts:119`

**Interfaces:**
- Consumes: nada.
- Produces: el color de marca *por defecto* (editable por el cliente) pasa a `#2563EB` en los 5 puntos.

- [ ] **Step 1: Los 5 reemplazos exactos**

`src/app/p/[token]/page.tsx` línea 69:

```ts
  const accent = branding.primaryColor || "#2563EB";
```

`src/components/ClientScoreCard.tsx` línea 19:

```ts
  accent = '#2563EB',
```

`src/components/TrendChart.tsx` línea 39:

```ts
  accent = '#2563EB',
```

`src/features/dashboard/AgencySection.tsx` línea 16:

```ts
  const [primaryColor, setPrimaryColor] = useState('#2563EB');
```

`src/features/dashboard/AgencySection.tsx` línea 138:

```tsx
                placeholder="#2563EB"
```

`src/app/actions/projects.ts` línea 119:

```ts
    .regex(/^#[0-9a-fA-F]{6}$/, "Color hex inválido (ej: #2563EB)")
```

- [ ] **Step 2: Verificar que no quedan defaults dorados y pasar tests**

Run: `grep -rn "D4A843" src/ --include="*.ts*"; pnpm vitest run src/components src/app/actions`
Expected: grep sin resultados; tests PASS (si `dashboard-summary.test.tsx` u otro pinta el default viejo, actualizar el assertion a `#2563EB`).

- [ ] **Step 3: Commit**

```bash
git add "src/app/p/[token]/page.tsx" src/components/ClientScoreCard.tsx src/components/TrendChart.tsx src/features/dashboard/AgencySection.tsx src/app/actions/projects.ts
git commit -m "feat(design): default de branding white-label dorado -> índigo #2563EB"
```

---

### Task 5: Auditoría `chartreuse` — usos semánticos de éxito a `chart-success`

**Files:**
- Modify: `src/app/ai/health/health-dashboard.client.tsx` (líneas 310, 318, 376, 388, 411, 543)

**Interfaces:**
- Consumes: tokens `--chart-success` (Task 1) y utilidades Tailwind `text-chart-success`/`bg-chart-success/10`.
- Produces: regla aplicada — `chartreuse` = acento de marca (índigo); ningún uso debe significar "sano/positivo".

- [ ] **Step 1: Migrar health-dashboard (todos sus usos son semántica "healthy")**

En `src/app/ai/health/health-dashboard.client.tsx` reemplazar TODAS las apariciones de `chartreuse` por `chart-success` (7 apariciones en 6 líneas: `text-chartreuse` → `text-chart-success`, `bg-chartreuse/10` → `bg-chart-success/10`). Los contextos: contadores `healthyCount`/`modelsHealthy` y ternarios `status === "healthy"`.

- [ ] **Step 2: Catalogar el resto con la regla de decisión**

Run: `grep -rn "chartreuse" src/ --include="*.tsx" | grep -v ".test." | grep -v "health-dashboard" | cut -d: -f1 | sort | uniq -c | sort -rn`

Regla de decisión para cada archivo del listado:
- El texto/clase expresa "sano, OK, positivo, verificado" (junto a palabras `healthy/ok/valid/passed` o checks) → migrar a `chart-success` (mismo patrón que health-dashboard).
- Es acento de marca (links, botones, destacados, categorías de docs, deltas positivos) → NO cambiar: hereda el índigo vía el token (comportamiento deseado).
- Caso dudoso → NO cambiar y anotarlo en la descripción del commit final.

- [ ] **Step 3: Verificar y commit**

Run: `pnpm vitest run src/app/ai && pnpm build`
Expected: PASS + build OK.

```bash
git add src/app/ai/health/health-dashboard.client.tsx
git commit -m "feat(design): semántica 'healthy' de chartreuse a chart-success

El índigo es acento de marca; los indicadores de salud pasan al verde
semántico --chart-success. Resto de usos chartreuse = marca (índigo)."
```

---

### Task 6: Verificación final, baselines de regresión visual y cierre

**Files:**
- Modify: `e2e/visual-regression.spec.ts` — solo sus snapshots (`e2e/visual-regression.spec.ts-snapshots/`), NO el código del spec
- Verify: todo `src/`

**Interfaces:**
- Consumes: Tasks 1-5 completos.
- Produces: criterio de aceptación del spec §9 completo.

- [ ] **Step 1: Suite unitaria completa**

Run: `pnpm test`
Expected: PASS. (Si un test assertion pintaba valores viejos — p.ej. hex dorados o tokens concretos — actualizar el assertion al nuevo valor; son cambios de aserción, no de producto.)

- [ ] **Step 2: Build de producción**

Run: `pnpm build`
Expected: exitoso.

- [ ] **Step 3: Aceptación grep — cero dorado de marca**

Run: `grep -rniE "#d4a843|#eba52d|#e3c167|#e5a83b" src/ --include="*.ts*"; grep -nE "0\.1[0-9]? 85\)" src/app/globals.css`
Expected: primer grep SIN resultados; segundo grep SOLO en las líneas `--chart-warning` (ámbar semántico, hue 85 permitido).

- [ ] **Step 4: Regenerar líneas base de regresión visual**

Run: `pnpm exec playwright test e2e/visual-regression.spec.ts --update-snapshots`
Expected: snapshots regenerados con la nueva paleta (el webServer de `playwright.config.ts` levanta la app). Los tests autenticados saltan si no hay `TEST_AUTH_*` — documentarlo en la descripción del commit. Revisar en el diff que los cambios de pixel corresponden a la paleta (fondos más claros, índigo en vez de dorado).

- [ ] **Step 5: Inspección visual manual (checklist del spec §9.3)**

Con `pnpm dev` + theme switcher (System/Light/Dark) verificar en: dashboard Overview, IntelligenceTab, MonitoringTab, SettingsTab, login, `/p/[token]`, `/ai/health`, `/swagger`. Checklist: cero restos dorados de marca; severidades intactas; fondo neural índigo en ambos temas; texto muted legible en ambos temas; ScoreGauge con pista visible en claro.

- [ ] **Step 6: Commit final**

```bash
git add e2e/visual-regression.spec.ts-snapshots
git commit -m "test(visual): regenerar líneas base para paleta v5 Slate + Indigo

Cambio visual intencional (spec 2026-10-04-redesign-paleta-indigo):
fondos pizarra/perla y acento índigo sustituyen al oliva/dorado."
```

---

## Cobertura del spec (self-review)

| Sección del spec | Task |
|---|---|
| §3 bloque dark completo | Task 1 Step 2 |
| §4 bloque light completo | Task 1 Step 3 |
| §3 cabecera "v5" + hero-scan | Task 1 Steps 1, 4 |
| §5 tokens corporativos | Task 1 Step 5 |
| §6.1 ScoreGauge (tiers + gauge-track) | Task 2 |
| §6.2 GeoMap hop | Task 3 (con desviación documentada: literal equiv. del token) |
| §6.3 AttackSurfaceGraph MX | Task 3 (ídem) |
| §6.4 white-label ×5 | Task 4 |
| §6.5 auditoría chartreuse (263 usos, regla) | Task 5 |
| §7 fuera de alcance | respetado (ningún task toca clases semánticas ni primitivas) |
| §8 contraste | valores fijados en Task 1/3; verificación en Task 6 Step 5 |
| §9 aceptación (test/build/grep/baselines/manual) | Task 6 Steps 1-5 |
