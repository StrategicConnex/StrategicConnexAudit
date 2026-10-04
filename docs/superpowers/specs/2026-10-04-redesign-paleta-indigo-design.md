# Diseño — Rediseño de paleta: "Slate + Indigo + Teal" (DS v5)

**Fecha:** 2026-10-04
**Estado:** Aprobado en sesión de brainstorming con acompañante visual (2026-10-04)
**Producto:** StrategicAudit Pro (`strategicaudit-pro`)
**Alcance elegido:** Tokens + barrido del dorado (sin adopción de primitivas ni refactor de accesibilidad — eso es Fase 3 del Plan de Mejoras)

**Spec de referencia del mockup:** los hex de los mockups aprobados son la fuente de verdad de la intención.
**ERRATUM (2026-10-04, post-merge):** los valores OKLCH de §3/§4 se redactaron con una conversión estimada incorrecta — `oklch(14% 0.012 260)` renderiza `#07090e` (casi negro), NO el `#1A1E26` aprobado. Valores correctos calculados: dark bg `oklch(23.5% 0.016 264)` = #1A1E26, card `oklch(28% 0.026 265)` = #232936, border `oklch(34.5% 0.030 264)` = #313949, light bg `oklch(93.3% 0.0075 261)` = #E6E9EE. `src/app/globals.css` (commit de corrección) es la fuente de verdad vigente; el erratum elevó también la familia dark completa (superficies, charts, glass) para mantener la jerarquía del mockup.

---

## 1. Contexto y problema

El design system v4 ("Olive + Gold + Teal NOC") usa un fondo casi negro absoluto (`oklch(4% 0.015 100)`) y un fondo claro casi blanco (`oklch(96% 0.008 100)`, tarjetas en blanco puro). Ambos extremos provocan fatiga visual en sesiones largas, y el dorado `oklch(72% 0.14 85)` como acento de marca quiere reemplazarse.

**Decisiones tomadas con el usuario (mockups renderizados en navegador):**

| Decisión | Opción elegida |
|---|---|
| Nuevo acento de marca | **Índigo "Signal"** — `#60A5FA` (dark) / `#2563EB` (light) |
| Nivel del modo oscuro | **Medio** — fondo ≈ `#1A1E26` (oklch 14%) |
| Nivel del modo claro | **Perla** — fondo ≈ `#E6E9EE` (oklch 92%) |
| Alcance | Tokens + barrido del dorado |

**Nueva identidad:** "Slate + Indigo + Teal NOC (v5)" — el tinte oliva (hue 100 OKLCH) pasa a pizarra neutro-fría (hue 260), que armoniza con el índigo.

## 2. Principios del cambio

1. **Solo cambian los tokens y los restos hardcodeados del dorado.** Todos los componentes que leen tokens (`bg-primary`, `text-chartreuse`, glass, neural, charts vía `use-chart-colors`) se actualizan solos.
2. **La semántica de severidad se conserva intacta:** rojo (danger), ámbar (warning), verde (success) no se tocan — ni en tokens ni en las ~370 clases crudas semánticas (fuera de alcance).
3. **Teal secundario y acentos multi-hue de data-viz se conservan** (hue 185 sigue distinto del índigo 260).
4. **El alias `--chartreuse` conserva su nombre** (263 usos en TSX) pero su valor pasa a índigo. Los usos donde `chartreuse` significa "sano/positivo" (semántica, no marca) migran a `text-chart-success`.
5. **Contraste AA verificado por token**, no a ojo (ver §8).

## 3. Bloque DARK nuevo (`globals.css` — `:root, [data-theme="dark"]`)

```css
--bg: oklch(14% 0.012 260);
--fg: oklch(93% 0.005 260);
--card: oklch(18% 0.014 260);
--card-fg: oklch(93% 0.005 260);
--popover: oklch(18% 0.014 260);
--popover-fg: oklch(93% 0.005 260);
--primary: oklch(71% 0.14 258);          /* #60A5FA */
--primary-fg: oklch(16% 0.04 262);
--secondary: oklch(55% 0.08 185);        /* teal — sin cambio */
--secondary-fg: oklch(95% 0.005 260);
--muted: oklch(21% 0.014 260);
--muted-fg: oklch(65% 0.015 260);
--accent: oklch(58% 0.10 185);           /* teal — sin cambio */
--accent-fg: oklch(95% 0.005 260);
--destructive: oklch(60% 0.22 25);       /* sin cambio */
--destructive-fg: oklch(98% 0.005 265);  /* sin cambio */
--border: oklch(26% 0.015 260);
--input: oklch(19% 0.013 260);
--ring: oklch(71% 0.14 258);
--radius: 12px;                           /* sin cambio */

--surface: oklch(15.5% 0.013 260);
--surface-elevated: oklch(19% 0.014 260);
--surface-muted: oklch(21.5% 0.014 260);
--surface-overlay: oklch(16% 0.013 260 / 0.78);
--overlay: oklch(0% 0 0 / 0.55);

--chartreuse: oklch(71% 0.14 258);       /* nombre intacto, valor → índigo */

--chart-grid: oklch(30% 0.012 260 / 0.5);
--chart-axis: oklch(58% 0.015 260);
--chart-label: oklch(68% 0.012 260);
--chart-primary: oklch(71% 0.14 258);
--chart-secondary: oklch(60% 0.10 185);  /* teal, ligera subida de L */
--chart-success: oklch(65% 0.13 150);    /* verde, subida de L para el bg más claro */
--chart-warning: oklch(75% 0.13 85);     /* ámbar semántico — hue intacto */
--chart-danger: oklch(60% 0.20 25);
--chart-tooltip: oklch(12% 0.014 260 / 0.95);

--glass-border: oklch(30% 0.015 260 / 0.5);
--glass-border-strong: oklch(71% 0.14 258 / 0.10);
--shadow-card: 0 8px 30px -8px oklch(0% 0 0 / 0.75);
--shadow-hero: 0 12px 40px -12px oklch(71% 0.14 258 / 0.10),
              inset 0 1px 0 oklch(100% 0 0 / 0.03);
--gradient-surface: linear-gradient(160deg, oklch(19% 0.013 260 / 0.75), oklch(15% 0.011 260 / 0.85));
--gradient-surface-hero: linear-gradient(160deg, oklch(20% 0.014 260 / 0.85), oklch(16% 0.012 260 / 0.9));
--gradient-primary: linear-gradient(135deg, oklch(64% 0.14 260), oklch(50% 0.12 265));
--gradient-accent: linear-gradient(135deg, oklch(55% 0.10 185), oklch(45% 0.08 170)); /* teal — sin cambio */

--neural-node: #60A5FA;
--neural-node-glow: rgba(96, 165, 250, 0.55);
--neural-line: rgba(96, 165, 250, 0.35);
--neural-canvas-opacity: 0.35;           /* media queries sm/lg sin cambio */

--accent-blue: oklch(68% 0.10 240);      /* multi-hue — sin cambio */
--accent-purple: oklch(60% 0.10 300);
--accent-cyan: oklch(65% 0.10 190);
--accent-indigo: oklch(58% 0.12 265);
--accent-violet: oklch(55% 0.12 285);

--grid-line: oklch(100% 0 0 / 0.012);
--shimmer-a: oklch(100% 0 0 / 0.025);
--shimmer-b: oklch(100% 0 0 / 0.07);
--scan-line: rgba(255, 255, 255, 0.01);
--selection-bg: oklch(71% 0.14 258 / 0.18);
--selection-fg: oklch(93% 0.005 260);
--scroll-thumb: oklch(30% 0.015 260);
--scroll-thumb-hover: oklch(38% 0.015 260);
```

## 4. Bloque LIGHT nuevo (`[data-theme="light"]`)

```css
--bg: oklch(92% 0.006 260);              /* #E6E9EE "perla" */
--fg: oklch(20% 0.015 260);
--card: oklch(97% 0.003 260);            /* blanco suave — ya no 100% puro */
--card-fg: oklch(20% 0.015 260);
--popover: oklch(97% 0.003 260);
--popover-fg: oklch(20% 0.015 260);
--primary: oklch(54% 0.20 262);          /* #2563EB */
--primary-fg: oklch(98.5% 0.002 260);
--secondary: oklch(88% 0.015 185);
--secondary-fg: oklch(20% 0.02 260);
--muted: oklch(88.5% 0.006 260);
--muted-fg: oklch(38% 0.02 260);
--accent: oklch(40% 0.08 185);           /* sin cambio */
--accent-fg: oklch(98% 0.003 260);
--destructive: oklch(52% 0.21 25);       /* sin cambio */
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
--chart-warning: oklch(55% 0.14 85);     /* ámbar semántico */
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
--gradient-accent: linear-gradient(135deg, oklch(40% 0.08 185), oklch(35% 0.07 170)); /* sin cambio */

--neural-node: #2563EB;
--neural-node-glow: rgba(37, 99, 235, 0.45);
--neural-line: rgba(37, 99, 235, 0.30);
--neural-canvas-opacity: 0.25;           /* media queries sin cambio */

/* multi-hue light — sin cambio */
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
```

## 5. Tokens corporativos (`src/styles/design-tokens.css`)

| Token | Hoy | Nuevo |
|---|---|---|
| `--corporate-accent` (light) | `#D4A843` | `#2563EB` |
| `--corporate-accent` (dark) | `#E3C167` | `#60A5FA` |
| `--corporate-primary-light` | `#2563EB` / `#60A5FA` | **sin cambio** (ya coincide con el índigo elegido) |
| resto del namespace (`primary`, superficies, borde, texto, warning, danger, success) | — | **sin cambio** (armoniza con la base pizarra) |

## 6. Barrido de restos del dorado (fuera de tokens)

1. **`src/features/dashboard/ScoreGauge.tsx`**
   - Los tres tiers (rojo/ámbar/verde) pasan a constantes de módulo alineadas con `--chart-danger/--chart-warning/--chart-success` de cada tema (el ámbar del tier "Advertencia" se conserva: es semántica).
   - El track del anillo `rgba(255,255,255,0.04)` pasa a una CSS var nueva `--gauge-track` (dark: `oklch(100% 0 0 / 0.06)`, light: `oklch(20% 0.02 260 / 0.08)`) — hoy es invisible en modo claro.
   - La clase `text-[oklch(75% 0.13 80)]` del tier warning se sustituye por el token equivalente.
2. **`src/features/dashboard/GeoMap.tsx`** — `hop: '#EBA52D'` → `--accent-cyan` (color categórico de rutas, deja de ser dorado).
3. **`src/features/dashboard/AttackSurfaceGraph.tsx`** — nodo MX `#EBA52D` → `--accent-blue` (categórico).
4. **Branding white-label (defaults editables por el cliente):**
   - `src/app/p/[token]/page.tsx:69` — `|| "#D4A843"` → `|| "#2563EB"`
   - `src/components/ClientScoreCard.tsx:19` — default `'#D4A843'` → `'#2563EB'`
   - `src/components/TrendChart.tsx:39` — ídem
   - `src/features/dashboard/AgencySection.tsx:16,138` — estado inicial y placeholder `#D4A843` → `#2563EB`
   - `src/app/actions/projects.ts:119` — ejemplo del mensaje de validación `#D4A843` → `#2563EB`
5. **Auditoría semántica de `chartreuse` (263 usos):** regla de decisión — `chartreuse` = acento de marca (ahora índigo). Los usos que expresan "sano/positivo/OK" migran a `text-chart-success` / `bg-chart-success`. Caso conocido: `src/app/ai/health/health-dashboard.client.tsx` (~6 usos de "healthy"). La implementación cataloga los 263 y aplica la regla; el resto hereda el índigo sin cambio de código.
6. **`src/app/globals.css`** — cabecera del DS: "Olive + Gold + Teal NOC" → "Slate + Indigo + Teal NOC (v5)"; la utilidad `hero-scan` y su keyframe pasan de alphas dorados a índigo.
7. **`src/components/NeuralNetworkBackground.tsx`** — sin cambio (lee `--neural-node`/`--neural-line`; sus fallbacks violetas `#7C3AED` permanecen como fallback).

## 7. Fuera de alcance

- Adopción de primitivas UI en componentes hand-rolled (Fase 3 del Plan de Mejoras).
- Las ~370 clases de paleta cruda semánticas (red/green/blue/purple/slate…) — funcionan en ambos temas y son de severidad/datos.
- Fuentes, tipografía, glassmorphism (estructural), animaciones, radar-grid, layout.
- `--corporate-*` superficies y `--corporate-primary` (#1E3A5F navy).
- Fondo neural: solo recolorea vía tokens.

## 8. Accesibilidad y contraste

- `--muted-fg` dark (65%) sobre `--bg` 14%: ≥ 5:1 (mejora el actual 58% sobre 4%).
- `--primary` dark `#60A5FA` sobre `--bg` #1A1E26: ≥ 4.5:1 para texto; `primary-fg` navy sobre índigo ≥ 7:1.
- `--primary` light `#2563EB` sobre `--card` 97%: ≥ 5:1.
- `--chart-warning` ámbar: solo sube L (72→75 dark) manteniendo hue 85; sigue ≥ 3:1 como elemento gráfico.
- Verificación en implementación: ejecutar los pares fg/bg de la tabla sobre ambos temas con un checker (contraste mínimo 4.5:1 texto, 3:1 UI).

## 9. Verificación (criterios de aceptación)

1. `pnpm test` verde (los tests unitarios no dependen de valores de color, pero se ejecuta como red de seguridad).
2. `pnpm build` verde.
3. Inspección visual manual con el theme switcher (System/Light/Dark) en: dashboard Overview, IntelligenceTab, MonitoringTab, SettingsTab, login, `/p/[token]` (reporte público), `/ai/health`, swagger. Cero restos dorados de marca visibles; severidades intactas.
4. El fondo neural se ve índigo en ambos temas.
5. `e2e/visual-regression.spec.ts`: regenerar líneas base (cambio de paleta = cambio visual esperado) y documentar la regeneración en el PR.
6. No debe quedar en `src/` ningún `#D4A843`/`#EBA52D` de marca (los únicos hex dorados permitidos tras el cambio son los del tier warning de ScoreGauge, alineados a `chart-warning`).

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| Restos dorados en componentes no catalogados | `grep` final de hues dorados + revisión visual por pantalla (§9.3) |
| El `chartreuse`→índigo cambia el significado de algún indicador semántico no detectado | Auditoría de los 263 usos en implementación (§6.5) |
| Contrastes que empeoran al aclarar el dark (textos muted, glows) | Valores de L definidos en spec + verificación AA (§8) |
| Líneas base de regresión visual desactualizadas | Regeneración documentada (§9.5) |
