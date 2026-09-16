---
name: end-user-simulation
description: Test any web app as a non-technical end user (no docs, no code, no jargon knowledge), find every UX gap that blocks or confuses them, and propose prioritized fixes. Use whenever the user asks to "probar como usuario final", "test like a beginner", "analizar baches", "UX audit for non-technical users", "is my app understandable", or before any public launch — even if they don't say "skill". Trigger on: "probar como usuario final", "test like a beginner", "analizar baches", "UX audit", "is my app understandable", "end-user simulation", "super-skill end-user", "probar el proyecto", "simulacion de usuario final", "analisis de baches UX".
---

# End-User Simulation Super-Skill

You are a small-business owner who just wants to know "¿mi sitio está bien?". You have never read the docs, never seen the code, and don't know what LCP, DNS, MITRE, SIEM, RUM, or Core Web Vitals mean. Every acronym without a plain-words explanation is a gap. Every number without "is this good or bad?" is a gap. Every dead end without a next step is a gap.

## Execution workflow (always follow in this order)

1. **Locate the app**: find the dev server URL and login credentials from `AGENTS.md`, `.env`, or project docs. If no test user exists, document the auth wall as B0/B1 and use a labeled bypass.
2. **Load bundled resources**: read `scripts/` for automation, `references/` for templates and checklists. Use them directly — do not improvise from memory.
3. **Run journeys J1–J4 in order** using the Playwright scripts in `scripts/`. Each journey produces screenshots saved to `C:\Users\Juan\AppData\Local\Temp\opencode\ux-<journey>-<step>.png`.
4. **Observe and record**: for each journey, note every hesitation, confusion, dead end, or moment the user would not know what to do next.
5. **Classify every finding** using the gap taxonomy below. Assign IDs: B-001, B-002, etc.
6. **Produce the report** using the format in `references/report-template.md`.
7. **Cleanup**: delete all `PRUEBA-E2E-*` data created during journeys. Stop any orphaned dev servers. Verify the database is clean.

## Personas (rotate at least 2 per campaign)

1. **Dueña pyme, 50 años, solo español, móvil Android.** Goal: saber si su tienda está bien. Taps, never types a URL by hand if a button exists.
2. **Community manager, desktop, prisa.** Goal: sacar un informe para su jefe. Skims headings, clicks the biggest button.
3. **Cliente escéptico.** Goal: encontrar motivos para NO confiar (datos raros, errores crudos, inglés mezclado). Reads error messages literally.

## Journeys (run against a dev server; screenshots at every step)

- **J1 Primer uso:** landing/login → entiende qué hace el producto? → entra (dev bypass SOLO si no hay usuario de prueba; etiquetar capturas como `bypass`) → dashboard vacío: ¿sabe qué hacer? → crea proyecto (primero con datos INVÁLIDOS para capturar validación, luego válido de prueba) → ¿entiende el resultado? → borra/desactiva lo creado (dejar la BD como estaba).
- **J2 Móvil 390px:** login → dashboard → drawer → ¿llega a todo sin perderse?
- **J3 Recuperación:** provoca un error (ruta mala, formulario vacío, sin sesión) → ¿el mensaje dice QUÉ pasó y QUÉ hacer, en su idioma?
- **J4 Informe:** genera o intenta generar el entregable principal → ¿lo entiende sin ayuda?

## Gap taxonomy (ID every finding: B-001, B-002...)

- **B0 Bloqueador:** no puede completar la tarea (sin navegación, auth imposible, crash).
- **B1 Confusión:** jerga sin explicar, inglés mezclado, CTA ambiguo ("Continue" vs "Guardar clave"), número sin veredicto (¿99.9% es bueno?).
- **B2 Confianza:** datos que parecen inventados, errores crudos (`Failed query`, `401`), promesas sin evidencia ("Secure", "99.98%").
- **B3 Pulido:** visual menor, copies mejorables, inconsistencias.

## Rules (non-negotiable)

- Nunca inventes credenciales ni uses cuentas reales. Para crear datos de prueba usa nombres obvios (`PRUEBA-E2E-*`) y BÓRRALOS al final del journey (usa el propio flujo de borrado de la app: eso también se evalúa).
- Sin sesión de prueba no cruces el login real: documenta el muro como hallazgo B0/B1 y evalúa dentro con bypass etiquetado.
- Sin secretos en salidas. Servidores de prueba se apagan al terminar; mata huérfanos del puerto.
- Capturas a temp con nombre `ux-<journey>-<paso>.png`; míralas de verdad antes de dictaminar.
- No propongas rediseños gigantes: cada propuesta lleva severidad, archivo:línea si aplica, y esfuerzo S/M/L.

## Report format (always close with this)

1. **Diario de journey** (3-6 líneas por journey: qué hizo el usuario, dónde dudó).
2. **Tabla de baches**: ID | Severidad | Evidencia (captura/archivo:línea) | Propuesta (concreta, S/M/L).
3. **Top 3 fixes** que más reducen abandono, en orden.

## Super-skill capabilities

This skill bundles the following to automate execution:

- **`scripts/run-j1.ts`** — Full J1 journey automation (Playwright): login, dashboard assessment, project creation with invalid data, validation errors, valid creation, verification, cleanup.
- **`scripts/run-j2.ts`** — Full J2 journey automation: mobile viewport (390px), drawer navigation, content visibility check.
- **`scripts/run-j3.ts`** — Full J3 journey automation: bad route, empty form submission, session-less access to protected routes.
- **`scripts/run-j4.ts`** — Full J4 journey automation: generate or attempt to generate the main deliverable.
- **`references/report-template.md`** — Structured markdown template for the final report.
- **`references/gap-checklist.md`** — Checklist of common non-technical user friction points to verify during each journey.
- **`references/persona-cards.md`** — Detailed persona descriptions with behavioral patterns and decision heuristics.
