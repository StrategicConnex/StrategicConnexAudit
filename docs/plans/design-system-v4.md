# Plan — Design System SCAUDIT v4

**Rama**: `feat/design-system-v4` · **Estado**: en ejecución · **Decisión**: landing incluida, mínimo tipográfico 11px, 3 fases seguidas.

## Fases

### Fase 0 — Preparación
- [ ] Rama + baseline visual (`docs/design/baseline/`)
- [ ] Inventario CSV de migración
- [x] Alcance: landing incluida (tokens en F1, re-verificación en F3.4)

### Fase 1 — Fundaciones
- [ ] Tokens tipográficos: `--text-2xs: 0.6875rem` (11px), `--text-xs: 0.75rem`, `--text-sm: 0.8125rem`, `--text-base: 0.875rem`, `--text-lg: 1rem`
- [ ] Migrar 814 `text-[Npx]` → 5 tokens (landing incluida)
- [ ] Manifiesto DS → "Olive + Gold + Teal NOC"; eliminar `--color-indigo`
- [ ] `glass-card` crudos → `<Card>` (~74); `<button>` crudos dashboard → `<Button>`
- **Gate**: tsc 0 · vitest verde · eslint 0 · screenshots sin regresión · `text-[Npx]` < 50

### Fase 2 — Contraste y estados
- [ ] Light: primary `oklch(45% 0.13 85)`, CTA sólido theme-scoped, pesos dark-tuned
- [ ] `Skeleton` + `EmptyState` en `ui/`; aplicar a audit/monitoring/reports/keywords
- [ ] `Badge` (live/neutral/alert); sidebar 17 badges → disciplina
- **Gate**: AA ≥4.5:1 · screenshots dark+light · suite verde

### Fase 3 — Firma visual
- [ ] `Card elevation` sin borde; glassmorphism solo overlays; medir FPS
- [ ] Oro único acento; multi-hue solo data-viz; sidebar indicador 2px
- [ ] Scan-line orquestada en hero (reduced-motion respetado)
- [ ] Re-verificación landing
- **Gate final**: suite + screenshots + Lighthouse → merge a `main`

## Mapeo tipográfico

| Actual | Destino |
|---|---|
| 7-9px | `text-2xs` (11px) |
| 10px | `text-xs` |
| 11-12px | `text-xs` / `text-sm` |
| 13-14px | `text-sm` / `text-base` |
| 15px+ | `text-base` / `text-lg` |

## Riesgos
- Salto 9→11px: migrar primero los 3 archivos más densos con screenshot inmediato
- Tests con asserts de clases: actualizar en el mismo commit
- FPS canvas neuronal: medir antes de migrar cards sin blur
