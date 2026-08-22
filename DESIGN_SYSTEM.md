# SCAUDIT Design System v3

**Design DNA:** Infrastructure-grade precision — the inside of a network operations center.

**Inspiration:** Real-world network management systems (NetScope, Dexter Cheney) — olive greens, warm golds, and teals that communicate "infraestructura" rather than generic "hacker" aesthetics.

---

## Color Palette

### Dark Theme (Default)

| Token | OKLCH Value | Hex Approximation | Usage |
|-------|-------------|-------------------|-------|
| `--bg` | `oklch(4% 0.015 100)` | `#0D0F08` | Page background |
| `--card` | `oklch(6% 0.018 100)` | `#111410` | Card backgrounds |
| `--surface` | `oklch(5% 0.015 100)` | `#0F1109` | Elevated surfaces |
| `--primary` | `oklch(72% 0.14 85)` | `#D4A843` | Gold — primary actions, CTA |
| `--secondary` | `oklch(55% 0.08 185)` | `#3D8B8B` | Teal — data precision |
| `--accent` | `oklch(58% 0.10 185)` | `#4A9E9E` | Teal — interactive elements |
| `--destructive` | `oklch(55% 0.22 25)` | `#CC3333` | Red — errors, danger |
| `--chartreuse` | `oklch(72% 0.14 85)` | `#D4A843` | Gold (same as primary) |
| `--muted-fg` | `oklch(58% 0.02 100)` | `#8A8A7A` | Muted text |
| `--border` | `oklch(14% 0.012 100)` | `#222520` | Subtle borders |

### Light Theme

| Token | OKLCH Value | Hex Approximation | Usage |
|-------|-------------|-------------------|-------|
| `--bg` | `oklch(96% 0.008 100)` | `#F5F3ED` | Warm cream background |
| `--card` | `oklch(100% 0 0)` | `#FFFFFF` | White cards |
| `--primary` | `oklch(50% 0.12 85)` | `#8B6F1A` | Dark gold — primary |
| `--secondary` | `oklch(90% 0.015 185)` | `#E5EDED` | Light teal — secondary |
| `--accent` | `oklch(40% 0.08 185)` | `#2D7A7A` | Dark teal — interactive |
| `--muted-fg` | `oklch(42% 0.02 100)` | `#5A5A4A` | Muted text |
| `--border` | `oklch(86% 0.012 100)` | `#D4D0C4` | Warm gray borders |

### Chart / Data Visualization

| Token | Dark | Light | Usage |
|-------|------|-------|-------|
| `--chart-primary` | Gold `72% 0.14 85` | `50% 0.12 85` | Primary data series |
| `--chart-secondary` | Teal `55% 0.10 185` | `40% 0.08 185` | Secondary data series |
| `--chart-success` | Green `60% 0.12 145` | `42% 0.12 145` | Positive indicators |
| `--chart-warning` | Amber `72% 0.12 85` | `52% 0.12 85` | Warning states |
| `--chart-danger` | Red `55% 0.22 25` | `52% 0.21 25` | Danger states |

---

## Typography

**Display:** Space Grotesk (weights 300-700)
**Body:** Inter (weights 400-700)
**Mono:** JetBrains Mono

### Type Scale

| Utility | Size | Weight | Line Height | Usage |
|---------|------|--------|-------------|-------|
| `text-hero` | clamp(3rem, 8vw, 6rem) | 700 | 1.0 | Hero headlines |
| `text-display` | clamp(1.5rem, 4vw, 2.5rem) | 700 | 1.08 | Section headers |
| `h1-h4` | Space Grotesk | 700 | — | Content headings |
| Body | Inter | 400 | — | Body text |

---

## Layout

### Header
- **Height:** 56px (`h-14`)
- **Background:** Semi-transparent with backdrop blur
- **Position:** Sticky top-0

### Sidebar
- **Expanded width:** 266px (`w-66`)
- **Collapsed width:** 72px (`w-[72px]`)
- **Behavior:** Icon-only mode when collapsed, localStorage persistence
- **Toggle:** `«` / `»` button in logo area

---

## Semantic Tokens

### Surfaces (Dark)
```
--surface          → Base surface
--surface-elevated → Elevated cards
--surface-muted    → Muted sections
--surface-overlay  → Glass overlay (75% opacity)
```

### Glass Effects
```css
glass-panel       → Surface overlay + blur(24px)
glass-card        → Gradient surface + blur(24px) + shadow
glass-card-hero   → Hero gradient + blur(32px) + strong shadow
```

### Neural Network Background
- **Dark:** Gold nodes (#D4A843) with gold glow
- **Light:** Dark gold nodes (#8B6F1A) with subtle glow
- **Opacity:** Mobile 35% → Desktop 55%

---

## Animations

| Token | Duration | Usage |
|-------|----------|-------|
| `--animate-scan-pulse` | 2.2s | Status indicators |
| `--animate-shimmer` | 2.5s | Loading states |
| `--animate-fade-in` | 0.3s | Content entrance |
| `--animate-slide-in-right` | 0.3s | Panel entrance |

---

## Accessibility

### WCAG Contrast Ratios
- **Dark theme:** All text tokens achieve AA (4.5:1+)
- **Light theme:** All text tokens achieve AA (4.5:1+)
- **Focus rings:** Visible keyboard focus on all interactive elements
- **Reduced motion:** All animations disabled via `prefers-reduced-motion`

---

## Migration from v2

### What Changed
1. **Hue shift:** 265° (indigo) → 100° (olive) across all tokens
2. **Primary:** Indigo `oklch(68% 0.14 230)` → Gold `oklch(72% 0.14 85)`
3. **Accent:** Chartreuse `oklch(78% 0.18 140)` → Teal `oklch(58% 0.10 185)`
4. **Font:** DM Sans → Space Grotesk
5. **Neural network:** Violet nodes → Gold nodes
6. **Header:** 80px → 56px
7. **Sidebar:** Fixed 266px → Collapsible (266px / 72px)

### Files Modified
- `src/app/globals.css` — All theme tokens
- `src/app/layout.tsx` — Font import
- `src/app/components/DashboardHeader.tsx` — Height reduction
- `src/app/components/DashboardSidebar.tsx` — Collapse functionality
- `src/app/components/tabs/*.tsx` — Hardcoded colors → CSS variables
- `src/app/components/BenchmarkingSection.tsx` — Chart colors

---

*SCAUDIT Design System v3 — August 2026*
