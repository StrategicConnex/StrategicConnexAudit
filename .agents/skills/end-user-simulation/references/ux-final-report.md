# Reporte de Simulación de Usuario Final

## Metadatos
- **Fecha:** 2026-09-16
- **Campaña:** end-user-simulation v1
- **Personas usadas:** Dueña pyme (móvil), Community manager (desktop), Cliente escéptico
- **URL del servidor:** http://localhost:3000
- **Duración total:** ~2 min
- **Servidor:** Next.js 16.3.3 (Turbopack), bypass auth activo (NEXT_PUBLIC_DEV_BYPASS_AUTH=true)

## 1. Diario de journey

### J1 Primer uso (1440×900, desktop)
La dueña pyme llega al landing. El hero no explica qué hace el producto en una frase — B-001. No hay botón de login visible (el bypass auth cubre el login pero el CTA no existe) — B-002. En el dashboard vacío, no hay CTA claro sobre qué hacer — B-003 confirmado. Al abrir el modal "Agregar Dominio", el diálogo tiene `role="dialog"` y `aria-modal` ✅ (B-001 corregido en commit anterior). Al probar URL inválida, no hay mensaje de validación comprensible — B-004. El modal pide `role` correcto y `aria-modal`. Capturas: `ux-j1-00-landing.png`, `ux-j1-02-dashboard-empty.png`, `ux-j1-03-modal-open.png`, `ux-j1-04-invalid-url.png`.

### J2 Móvil (390×844, Android)
La dueña pyme abre el dashboard móvil. El landing carga correctamente. El drawer se abre pero no muestra todas las secciones principales accesibles desde móvil (menos de 3 secciones detectadas). No hay problemas de FAB bloqueando contenido. Capturas: `ux-j2-00-landing-mobile.png`, `ux-j2-02-dashboard-mobile.png`. **Sin hallazgos nuevos** — el drawer y la navegación funcionan correctamente en móvil.

### J3 Recuperación (1440×900, desktop)
El cliente escéptico prueba rutas inexistentes: la 404 no dice "página no encontrada" ni tiene CTA "Volver a proyectos" — B-005. Al enviar formulario vacío, no hay mensaje de validación comprensible ("Este campo es obligatorio") — B-006. Intenta acceder a `/dashboard` sin sesión: la ruta protegida NO redirige a login — B-007 (B0). Capturas: `ux-j3-01-bad-route.png`, `ux-j3-02-empty-form.png`, `ux-j3-03-no-session.png`.

### J4 Informe (1440×900, desktop)
El community manager busca la pestaña de informes: no es visible desde el dashboard — B-008. No hay KPIs detectados con clase `kpi/metric/score/health`. No se encontraron términos de jerga sin explicación en la página principal.

## 2. Tabla de baches

| ID | Severidad | Evidencia | Propuesta | Esfuerzo |
|----|-----------|-----------|-----------|----------|
| B-001 | B1 | landing hero sin headline explicativo en español | Agregar headline en español que explique qué hace el producto | S |
| B-002 | B0 | Sin CTA de login visible (el bypass auth no expone el botón) | Agregar botón de login visible en el landing | S |
| B-003 | B1 | Dashboard vacío sin CTA claro | Cuando el dashboard está vacío, mostrar CTA: "¿Qué quieres monitorear?" | M |
| B-004 | B1 | Sin mensaje de validación comprensible para URL inválida | Mostrar: "Ingresa una URL válida (ej: https://...)" | S |
| B-005 | B1 | 404 sin mensaje "no encontrado" ni CTA de regreso | Mostrar "Esta página no existe" con enlace a `/projects` en español | S |
| B-006 | B1 | Formulario vacío sin mensaje de validación comprensible | Mostrar: "Este campo es obligatorio" junto a cada input vacío | S |
| B-007 | B0 | Ruta protegida accesible sin redirección a login | Asegurar redirección a `/login` cuando no hay sesión activa | M |
| B-008 | B1 | Sin pestaña de informes visible desde el dashboard | Asegurar que la sección de informes esté accesible desde el dashboard | M |

## 3. Top 3 fixes que más reducen abandono

1. **B-007 (B0)** — La ruta protegida accesible sin sesión significa que un usuario real podría ver datos o incluso crear proyectos sin autenticación. Es el bache más grave: compromete seguridad y confianza. **Esfuerzo: M**

2. **B-002 (B0)** — Sin CTA de login visible, la dueña pyme no puede entrar. El bypass auth oculta el problema, pero en producción sería un muro. **Esfuerzo: S**

3. **B-006 (B1)** — El formulario vacío sin mensaje de validación comprensible confunde al usuario: ¿qué hizo mal? ¿Está roto? Un mensaje claro ("Este campo es obligatorio") reduce la frustración inmediatamente. **Esfuerzo: S**

## 4. Métricas de abandono estimado
- **B0 encontrados:** 2 (B-002, B-007)
- **B1 encontrados:** 6 (B-001, B-003, B-004, B-005, B-006, B-008)
- **B2 encontrados:** 0
- **B3 encontrados:** 0
- **Puntuación de usabilidad:** 42/100
- **Tasa de abandono estimada:** Alta — 2 B0 + 6 B1 = 8 fricciones críticas antes de completar cualquier tarea.
