---
name: ux-redesign
description: "Convenciones del rediseño UX/UI incremental de SCAUDIT (spec 2026-09-18): tokens corporate, wrappers Base UI, cadencia semanal, testing jsdom e i18n. Usar al implementar cualquier semana del plan."
category: workflow
risk: safe
source: personal
date_added: "2026-09-19"
tags:
  - redesign
  - tailwind-v4
  - base-ui
  - next-intl
  - vitest
tools:
  - opencode
---

# UX Redesign — Convenciones del Programa

Rediseño incremental (12 semanas, un PR/semana). Specs:
`docs/superpowers/specs/2026-09-18-ux-ui-redesign-design.md` (fiel al
original azul corporativo) + `-implementation-plan.md`.

## Decisión marco (fijada Semana 1, no reabrir sin motivo)

- **Docs fieles al spec** (azul `#1E3A5F`, DM Sans, Headless UI literal).
- **Implementación adaptada al repo**: Tailwind v4 CSS-first (sin
  `tailwind.config.ts`), `@base-ui/react` existente (NO instalar
  `@headlessui/react`), coexistir con el DS v4 oscuro (no reescribirlo).
- `DESIGN_SYSTEM.md` v3 y `globals.css` (@theme inline, OKLCH) mandan
  para lo existente; lo nuevo usa namespace `corporate-*`.

## Cadencia semanal

1. Rama `feat/ux-ui-redesign-semanaN` desde `main` (nunca implementar en `main`).
2. Implementar la semana del plan adaptando al repo (ver § Divergencias).
3. Verificar (ver § Checklist) → commit en la rama.
4. Menú finishing: merge local / PR / mantener (decide el humano).
5. Merge → verificar en `main` (tests dirigidos + `tsc` + paridad) → borrar rama.

## Dónde va cada cosa

- Tokens: `src/styles/design-tokens.css` (`--corporate-*` + `@theme inline`;
  `@theme` en archivo importado SÍ lo recoge Tailwind v4 — probado con
  compilación real). Import en `globals.css` tras `@import "tailwindcss"`.
- Primitivos: `src/components/ui/*.tsx` (`'use client'`, `cn`/`focusRing`
  de `@/lib/utils`, piel glass/corporate, transiciones
  `data-[starting-style]/[ending-style]`).
- Face DM Sans pendiente (`@fontsource/dm-sans` ya es dependencia;
  cargarla vía `next/font` en `layout.tsx` cuando toque).
- `sonner` sigue como path imperativo hasta Semana 10 (`NotificationCenter`).

## Divergencias spec↔repo ya resueltas

- Anchos sidebar 266/72 + header h-14 sticky (repo) > 256/64 + 64px (spec).
- `Button/Badge/Card` existían con APIs ricas: extender, no reescribir.
- Sin Storybook (criterio N/A). Sin componentes shadcn que migrar (solo
  `role="dialog"` artesanales: `NewProjectModal` migrado S2, `MobileNav` S3).
- Paleta ⌘K: contrato `OPEN_PALETTE_EVENT = 'scaudit:open-palette'`
  (`DashboardHeader.tsx`) + atajo global Ctrl/⌘K ya registrado; la UI
  llega en Semana 4.

## i18n (obligatorio)

- Toda key nueva va en `messages/es.json` Y `messages/en.json` (paridad
  idéntica, el guard `scripts/i18n-parity.mjs` falla si divergen).
- Verificar: `node scripts/i18n-parity.mjs` → divergencia 0.00%.

## Testing jsdom (límites aprendidos)

- Cada test UI importa `@testing-library/jest-dom/vitest` (sin setupFiles).
- Providers: `NextIntlClientProvider` (mensajes reales de `messages/es.json`
  — así se prueba existencia de keys) + `ThemeProvider` de
  `@/shared/design-system`.
- Stubs en `beforeEach`: `localStorage` en memoria, `window.matchMedia`.
- `next/navigation`: mockear `useRouter` o inyectar stubs (ej. `NewProjectModal`).
- Límites Base UI v1 en jsdom (documentar con NOTA en el test, no pelear):
  - Dialog no emite `aria-modal` (modalidad vía focus-trap/scroll-lock).
  - Tabs con activación manual (`activateOnFocus=false` por defecto);
    verificar roving tabindex 0/-1 + click.
  - Select: selección con ratón exige secuencia pointer real; usar
    `items={{...}}` (mapa determinista) + `placeholder` en `Select.Value`
    (NO en `Select.Root`); `SelectItem` registra `label` explícito.
  - Keyboard del composite (flechas) no responde a eventos sintéticos.

## Checklist de verificación

1. `pnpm exec tsc --noEmit` → 0 errores.
2. `pnpm exec vitest run` completa en verde.
3. `pnpm lint` → 0 errores (warnings preexistentes fuera de tu diff: OK).
4. `node scripts/i18n-parity.mjs` + `guard-client-secrets` + `guard-client-cdns`.
5. `pnpm build` en hitos (Fases) — exit 0, páginas estáticas OK.

## Flaky conocido (preexistente, no tocar)

- `src/server/intelligence/security/egress-guard.test.ts`: falla a veces
  bajo carga de la suite completa (`expected 502 to be 302`), pasa aislado
  (31/31) y en la mayoría de runs. No relacionado con UI.
