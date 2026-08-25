# Plan — Design System SCAUDIT v4

**Rama**: `feat/design-system-v4` · **Estado**: en ejecución · **Decisión**: landing incluida, mínimo tipográfico 11px, 3 fases seguidas.

## Fases

### Fase 0 — Preparación
- [ ] Rama + baseline visual (`docs/design/baseline/`)
- [ ] Inventario CSV de migración
- [x] Alcance: landing incluida (tokens en F1, re-verificación en F3.4)

### Fase 1 — Fundaciones
- [x] Tokens tipográficos: `--text-2xs: 0.6875rem` (11px), `--text-xs: 0.75rem`, `--text-sm: 0.8125rem`, `--text-base: 0.875rem`, `--text-lg: 1rem`
- [x] Migrar 802 `text-[Npx]` → escala estándar + `text-2xs` (11px). Defaults de Tailwind intactos
- [x] Manifiesto DS → "Olive + Gold + Teal NOC"; eliminado `--color-indigo` (huérfano confirmado)
- [x] `<Card>` con variante hero + OverviewTab migrado como referencia. Resto (~92 instancias) = deuda incremental: todo card nuevo usa `<Card>`
- **Gate**: tsc 0 · vitest verde · eslint 0 · screenshots sin regresión · `text-[Npx]` < 50

### Fase 2 — Contraste y estados
- [x] Light: primary `oklch(45% 0.13 85)` en primary/ring/chart-primary/gradient/borders. CTA sólido verificado en screenshots
- [x] `Skeleton`+`SkeletonList` y `EmptyState` en `ui/`; aplicados a /security/audit (2 skeletons visibles + 4 empty states con iconos, emoji roto eliminado)
- [x] `Badge` (live/neutral/alert); sidebar: 14 badges migrados (1 live, 1 alert, 12 neutral)
- **Gate**: AA ≥4.5:1 · screenshots dark+light · suite verde

### Fase 3 — Firma visual
- [x] `Card variant="elevation"` sin borde (patrón Vercel); aplicada a OverviewTab
- [x] Eliminado drop-shadow indigo residual (rgba(99,102,241)); indicador oro 2px en nav activo
- [x] hero-scan 1.4s una sola vez + fade-in escalonado bento/banner (motion-reduce respetado)
- [x] Landing/dashboard re-verificado (tipografía migrada en F1, screenshots finales)
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
